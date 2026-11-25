<?php
/**
 * AURA IPTV — streaming proxy (web fallback)
 *
 * Why this exists: the site is hosted on Firebase (static), so there is no
 * /api/stream route and the browser cannot play the streams itself:
 *   - http:// manifests are blocked as mixed content on an https page
 *   - most CDNs do not send CORS headers, so hls.js cannot fetch them
 *   - some servers reject requests without the right Referer
 * This script fetches the stream server-side, rewrites HLS manifests so every
 * variant/segment also goes through this proxy, and returns it with CORS on.
 *
 *   /aura-proxy/?url=<encoded-stream-url>
 */

declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Range, Content-Type');
header('Cache-Control: no-store, max-age=0');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$maxBody     = 2 * 1024 * 1024;   // manifest cap
$bufferLimit = 256 * 1024;        // bytes buffered before deciding
$timeout     = 15;

/** Resolve a host to IPs and refuse anything that is not public. */
function is_public_host(string $host): bool
{
    if ($host === '' || $host === 'localhost') return false;
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        $ip = $host;
    } else {
        $ips = @gethostbynamel($host);
        if ($ips === false || $ips === []) return false;
        $ip = $ips[0];
    }
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
        return false;
    }
    // IPv6 private / loopback / link-local
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        $packed = @inet_pton($ip);
        if ($packed === false) return false;
        $hex = bin2hex($packed);
        if (str_starts_with($hex, '00000000000000000000000000000001')) return false; // ::1
        if (str_starts_with($hex, 'fe80')) return false;
        if (str_starts_with($hex, 'fc') || str_starts_with($hex, 'fd')) return false;
    }
    return true;
}

/** Rewrite a manifest so every URI goes through this proxy (absolute, resolved). */
function rewrite_manifest(string $body, string $baseUrl): string
{
    $lines = explode("\n", $body);
    foreach ($lines as $i => $line) {
        $trimmed = trim($line);
        if ($trimmed === '') continue;

        if ($trimmed[0] === '#') {
            if (!preg_match('/URI="([^"]+)"/', $trimmed)) continue;
            $lines[$i] = preg_replace_callback('/URI="([^"]+)"/', function ($m) use ($baseUrl) {
                $abs = resolve_url($m[1], $baseUrl);
                return 'URI="' . proxy_url($abs) . '"';
            }, $line);
            continue;
        }
        $lines[$i] = proxy_url(resolve_url($trimmed, $baseUrl));
    }
    return implode("\n", $lines);
}

function resolve_url(string $uri, string $base): string
{
    if (preg_match('#^https?://#i', $uri)) return $uri;
    if (!preg_match('#^https?://#i', $base)) return $uri;
    if (str_starts_with($uri, '//')) {
        $scheme = parse_url($base, PHP_URL_SCHEME) ?: 'https';
        return $scheme . ':' . $uri;
    }
    $parts = parse_url($base);
    if ($parts === false) return $uri;
    $scheme = $parts['scheme'] ?? 'https';
    $host   = $parts['host'] ?? '';
    $port   = isset($parts['port']) ? ':' . $parts['port'] : '';
    if (str_starts_with($uri, '/')) return $scheme . '://' . $host . $port . $uri;
    $path = $parts['path'] ?? '/';
    $dir  = preg_replace('#/[^/]*$#', '/', $path);
    return $scheme . '://' . $host . $port . $dir . $uri;
}

function proxy_url(string $abs): string
{
    return '/aura-proxy/?url=' . rawurlencode($abs);
}

/* ------------------------------------------------------------------ */

$url = $_GET['url'] ?? '';
if (!is_string($url) || !preg_match('#^https?://#i', $url)) {
    http_response_code(400);
    exit('bad url');
}

$host = parse_url($url, PHP_URL_HOST);
if (!is_public_host((string)$host)) {
    http_response_code(403);
    exit('forbidden host');
}

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS      => 5,
    CURLOPT_TIMEOUT        => $timeout,
    CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_RETURNTRANSFER => false,
    CURLOPT_ENCODING       => '',
    CURLOPT_HTTPHEADER     => [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept: */*',
        'Accept-Language: en-US,en;q=0.9',
    ],
]);

$contentType = '';
$status      = 0;
$effective   = $url;
$head        = '';
$isManifest  = null;
$sentHeader  = false;

$write = function ($ch, $data) use (&$head, &$isManifest, $bufferLimit, &$sentHeader, $contentType) {
    if ($isManifest === false) return strlen($data);           // already streaming raw
    $head .= $data;
    if (strlen($head) >= $bufferLimit) {
        $isManifest = (stripos($contentType, 'mpegurl') !== false)
            || (strncasecmp(ltrim($head), '#EXTM3U', 7) === 0);
    }
    return strlen($data);
};

curl_setopt($ch, CURLOPT_WRITEFUNCTION, $write);
curl_setopt($ch, CURLOPT_HEADERFUNCTION, function ($ch, $line) use (&$contentType) {
    if (preg_match('/^Content-Type:\s*(.+)$/i', $line, $m)) {
        $contentType = trim($m[1]);
    }
    return strlen($line);
});

ob_start();
curl_exec($ch);
$err     = curl_error($ch);
$status  = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentType = $contentType ?: (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
$effective   = (string)curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
$downloaded  = (int)curl_getinfo($ch, CURLINFO_SIZE_DOWNLOAD);
curl_close($ch);
$body = ob_get_clean();

if ($err !== '' || $status === 0) {
    http_response_code(502);
    exit('upstream error');
}
if ($status >= 400) {
    http_response_code($status);
    exit;
}

$looksManifest = (stripos($contentType, 'mpegurl') !== false)
    || (strncasecmp(ltrim($body), '#EXTM3U', 7) === 0);

if ($looksManifest && $downloaded <= $maxBody) {
    header('Content-Type: application/vnd.apple.mpegurl');
    echo rewrite_manifest((string)$body, $effective);
    exit;
}

if ($contentType !== '') {
    header('Content-Type: ' . $contentType);
}
echo $body;
