<?php
/**
 * Recebe o formulário de contato do site e encaminha por e-mail para a caixa da empresa.
 *
 * Contrato (ver README, "Contrato do endpoint"): POST com JSON {nome, empresa, email, telefone, interesse, produto, mensagem}.
 * Resposta 2xx com {"ok":true} significa que a solicitação foi aceita e entregue ao servidor de e-mail da hospedagem;
 * não garante que chegou à caixa de entrada. Qualquer outra resposta mantém os dados no formulário para nova tentativa.
 *
 * Proteções: só POST JSON da própria origem, limites de tamanho, campo-armadilha, limite de envios por endereço.
 * Nada do conteúdo da mensagem é gravado em arquivo ou log.
 */

declare(strict_types=1);

const DESTINATARIO = 'contato@unionsolutions.tech';
const REMETENTE = 'contato@unionsolutions.tech';
const ORIGENS_PERMITIDAS = ['https://unionsolutions.tech', 'https://www.unionsolutions.tech'];
const LIMITE_ENVIOS = 5;          // por endereço IP
const JANELA_SEGUNDOS = 3600;     // na última hora
const TAMANHO_MAXIMO = 16 * 1024; // bytes do corpo JSON
const INTERESSES = ['produto', 'consultoria', 'arquitetura', 'desenvolvimento', 'parceria'];
const PRODUTOS = ['hookguard', 'filenorm', 'assinaflow', 'archlens', 'fluxe-b2b-suite', 'comercialcloud', 'ainda-nao-sei'];

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function responder(int $status, array $corpo): never
{
    http_response_code($status);
    echo json_encode($corpo, JSON_UNESCAPED_UNICODE);
    exit;
}

/** A própria origem do servidor (o site e o script ficam no mesmo domínio) e as origens fixas da empresa. */
function origensPermitidas(): array
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $propria = $host !== '' ? ($https ? 'https' : 'http') . '://' . $host : null;
    return array_values(array_unique(array_filter(array_merge(ORIGENS_PERMITIDAS, [$propria]))));
}

function origemPermitida(): bool
{
    $permitidas = origensPermitidas();
    $origem = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origem === '') {
        // Sem cabeçalho Origin (ex.: ferramenta de linha de comando), vale o Referer.
        $referer = $_SERVER['HTTP_REFERER'] ?? '';
        foreach ($permitidas as $permitida) {
            if (str_starts_with($referer, $permitida . '/')) {
                return true;
            }
        }
        return false;
    }
    return in_array($origem, $permitidas, true);
}

/** Limite por endereço, em arquivos fora da raiz pública quando possível. Falha do limite não bloqueia o envio. */
function excedeuLimite(): bool
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'desconhecido';
    $pastas = [dirname(__DIR__) . '/contato-limite', sys_get_temp_dir() . '/contato-limite'];
    foreach ($pastas as $pasta) {
        if (!is_dir($pasta) && !@mkdir($pasta, 0700, true)) {
            continue;
        }
        if (!is_writable($pasta)) {
            continue;
        }
        $arquivo = $pasta . '/' . hash('sha256', $ip) . '.json';
        $agora = time();
        $registros = [];
        if (is_file($arquivo)) {
            $registros = json_decode((string) file_get_contents($arquivo), true) ?: [];
        }
        $registros = array_values(array_filter($registros, fn ($t) => is_int($t) && $t > $agora - JANELA_SEGUNDOS));
        if (count($registros) >= LIMITE_ENVIOS) {
            return true;
        }
        $registros[] = $agora;
        @file_put_contents($arquivo, json_encode($registros), LOCK_EX);
        // Limpeza ocasional de registros antigos de outros endereços.
        if (random_int(1, 50) === 1) {
            foreach (glob($pasta . '/*.json') ?: [] as $antigo) {
                if (filemtime($antigo) < $agora - JANELA_SEGUNDOS) {
                    @unlink($antigo);
                }
            }
        }
        return false;
    }
    return false;
}

/** Campos de uma linha perdem quebras de linha; só a mensagem as mantém. */
function texto(array $dados, string $campo, int $maximo, bool $umaLinha = true): string
{
    $valor = $dados[$campo] ?? '';
    if (!is_string($valor)) {
        responder(422, ['ok' => false, 'erro' => "Campo inválido: $campo."]);
    }
    $valor = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $valor) ?? '';
    if ($umaLinha) {
        $valor = preg_replace('/[\r\n]+/', ' ', $valor) ?? '';
    }
    $valor = trim($valor);
    if (mb_strlen($valor) > $maximo) {
        responder(422, ['ok' => false, 'erro' => "Campo muito longo: $campo."]);
    }
    return $valor;
}

/** Cabeçalhos de e-mail não podem receber quebras de linha. */
function linhaDeCabecalho(string $valor): string
{
    return str_replace(["\r", "\n"], ' ', $valor);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    responder(405, ['ok' => false, 'erro' => 'Use POST.']);
}
if (!origemPermitida()) {
    responder(403, ['ok' => false, 'erro' => 'Origem não permitida.']);
}
$tipo = $_SERVER['CONTENT_TYPE'] ?? '';
if (!str_starts_with(strtolower($tipo), 'application/json')) {
    responder(415, ['ok' => false, 'erro' => 'Envie JSON.']);
}
$corpo = file_get_contents('php://input', false, null, 0, TAMANHO_MAXIMO + 1);
if ($corpo === false || strlen($corpo) > TAMANHO_MAXIMO) {
    responder(413, ['ok' => false, 'erro' => 'Mensagem muito longa.']);
}
$dados = json_decode($corpo, true);
if (!is_array($dados)) {
    responder(400, ['ok' => false, 'erro' => 'JSON inválido.']);
}

// Campo-armadilha preenchido: só robôs o veem. Responde como sucesso, sem enviar nada.
if (!empty($dados['site_web'])) {
    responder(200, ['ok' => true]);
}

$nome = texto($dados, 'nome', 120);
$empresa = texto($dados, 'empresa', 160);
$email = texto($dados, 'email', 160);
$telefone = texto($dados, 'telefone', 40);
$interesse = texto($dados, 'interesse', 40);
$produto = texto($dados, 'produto', 40);
$mensagem = texto($dados, 'mensagem', 4000, false);

if ($nome === '' || $email === '' || $mensagem === '' || $interesse === '') {
    responder(422, ['ok' => false, 'erro' => 'Preencha nome, e-mail, interesse e mensagem.']);
}
if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    responder(422, ['ok' => false, 'erro' => 'E-mail inválido.']);
}
if (!in_array($interesse, INTERESSES, true)) {
    responder(422, ['ok' => false, 'erro' => 'Interesse inválido.']);
}
if ($interesse === 'produto' && !in_array($produto, PRODUTOS, true)) {
    responder(422, ['ok' => false, 'erro' => 'Produto inválido.']);
}
if ($interesse !== 'produto') {
    $produto = '';
}
if (mb_strlen($mensagem) < 10) {
    responder(422, ['ok' => false, 'erro' => 'Mensagem muito curta.']);
}

if (excedeuLimite()) {
    responder(429, ['ok' => false, 'erro' => 'Muitos envios em pouco tempo. Tente de novo mais tarde ou escreva para ' . DESTINATARIO . '.']);
}

$assunto = 'Contato pelo site: ' . $interesse . ($produto !== '' ? " ($produto)" : '') . ' - ' . $nome;
$linhas = [
    'Nova mensagem pelo formulário do site.',
    '',
    'Nome: ' . $nome,
    'Empresa: ' . ($empresa !== '' ? $empresa : '-'),
    'E-mail: ' . $email,
    'Telefone: ' . ($telefone !== '' ? $telefone : '-'),
    'Interesse: ' . $interesse,
    'Produto: ' . ($produto !== '' ? $produto : '-'),
    '',
    'Mensagem:',
    $mensagem,
    '',
    'Enviado em ' . gmdate('Y-m-d H:i:s') . ' UTC.',
];
$cabecalhos = [
    'From: Site Union Solutions <' . REMETENTE . '>',
    'Reply-To: ' . linhaDeCabecalho($nome) . ' <' . linhaDeCabecalho($email) . '>',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    'X-Mailer: formulario-site',
];
$assuntoCodificado = '=?UTF-8?B?' . base64_encode(linhaDeCabecalho($assunto)) . '?=';

$enviado = @mail(DESTINATARIO, $assuntoCodificado, implode("\r\n", $linhas), implode("\r\n", $cabecalhos), '-f' . REMETENTE);
if (!$enviado) {
    error_log('contato.php: o servidor de e-mail recusou o envio');
    responder(502, ['ok' => false, 'erro' => 'Não foi possível enviar agora. Escreva para ' . DESTINATARIO . '.']);
}
responder(200, ['ok' => true]);
