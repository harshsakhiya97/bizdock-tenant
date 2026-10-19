<?php
// Landing page webhook on shared hosting: passes the form post on to the Supabase function
// lead-webhook, keeping the query string (?key=…&utm_…) and the body as they came.
// __SUPABASE_URL__ is filled in at deploy time (.github/workflows).
$target = '__SUPABASE_URL__/functions/v1/lead-webhook';
if (!empty($_SERVER['QUERY_STRING'])) $target .= '?' . $_SERVER['QUERY_STRING'];

$method = $_SERVER['REQUEST_METHOD'] ?? 'POST';
if ($method === 'OPTIONS') {
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Headers: content-type');
  header('Access-Control-Allow-Methods: POST, OPTIONS');
  exit;
}

$headers = [];
if (!empty($_SERVER['CONTENT_TYPE'])) $headers[] = 'Content-Type: ' . $_SERVER['CONTENT_TYPE'];
$body = file_get_contents('php://input');

$ch = curl_init($target);
curl_setopt_array($ch, [
  CURLOPT_CUSTOMREQUEST => $method,
  CURLOPT_POSTFIELDS => $body,
  CURLOPT_HTTPHEADER => $headers,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HEADER => true,
  CURLOPT_FOLLOWLOCATION => false,
  CURLOPT_TIMEOUT => 20,
]);
$res = curl_exec($ch);
if ($res === false) {
  http_response_code(502);
  header('Content-Type: application/json');
  echo json_encode(['ok' => false, 'error' => 'Could not reach the lead service']);
  exit;
}
$status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$hsize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
curl_close($ch);

http_response_code($status);
foreach (explode("\r\n", substr($res, 0, $hsize)) as $h) {
  // pass on the type and a thank-you redirect (plain HTML forms)
  if (preg_match('/^(content-type|location):/i', $h)) header($h);
}
header('Access-Control-Allow-Origin: *');
echo substr($res, $hsize);
