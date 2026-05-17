$env:PORT = if ($env:PORT) { $env:PORT } else { "8787" }
$env:HOST = if ($env:HOST) { $env:HOST } else { "0.0.0.0" }
$env:DATA_FILE = if ($env:DATA_FILE) { $env:DATA_FILE } else { "./data/db.json" }
$env:JWT_SECRET = if ($env:JWT_SECRET) { $env:JWT_SECRET } else { "troque-esta-chave-em-producao" }

$bundledNode = "C:\Users\ViniciusLuz\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (Test-Path $bundledNode) {
  & $bundledNode src/server.mjs
} else {
  node src/server.mjs
}
