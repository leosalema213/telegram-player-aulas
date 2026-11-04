# Player de Aulas

Aplicativo para Windows que organiza aulas de vídeo de canais do Telegram acessíveis à sua conta. O catálogo, o progresso e as preferências ficam no computador. A sessão é protegida pelo armazenamento seguro do Windows.

## Instalar e usar

1. Baixe **Player-de-Aulas-Instalar.exe** na [página de versões](https://github.com/leosalema213/telegram-player-aulas/releases/latest), abra o instalador e escolha a pasta de instalação.
2. Entre em [API development tools](https://my.telegram.org/apps) com sua conta Telegram e crie as credenciais para obter seu API ID e API hash.
3. No aplicativo, informe as credenciais, o país e o telefone. Confirme o código recebido e, se necessário, a senha de verificação em duas etapas.
4. Escolha **Importar canal**, selecione um canal ao qual sua conta já tem acesso e importe as aulas. O app não concede acesso a canais privados.
5. Abra uma aula ou marque a caixa ao lado dela para registrar que já assistiu. **Continuar** retoma o ponto salvo; **Modo teatro** amplia o vídeo e recolhe a lista de aulas.
6. Os documentos do canal aparecem em **Materiais para baixar**. Escolha **Baixar** e indique onde salvar. Em cursos importados anteriormente, use **Atualizar** para consultar os materiais e novas aulas preservando o progresso das aulas ainda presentes.

Ao abrir, o player prepara a aula pendente mais recente no ponto salvo, sem iniciar a reprodução automaticamente. Nos controles, ajuste a velocidade com as opções rápidas, o controle deslizante ou um valor entre 0,25× e 2×; a escolha é mantida entre aulas e cursos.

O aplicativo consulta versões estáveis ao abrir. Em **Preferências → Atualizações**, também é possível verificar manualmente, baixar e instalar quando preferir. Atualizações preservam os dados locais. O instalador não possui assinatura digital; o Windows pode apresentar um aviso ao abri-lo.

O player ainda não exibe mensagens patrocinadas dos canais. Os [termos da API do Telegram](https://core.telegram.org/api/terms) exigem suporte a elas em aplicativos que acessam canais; essa adequação segue pendente.

## Desenvolvimento no Windows

Com Node.js e npm instalados, execute no PowerShell:

```powershell
git clone https://github.com/leosalema213/telegram-player-aulas.git
Set-Location telegram-player-aulas
npm.cmd install
npm.cmd run demo
```

A demonstração abre um curso fictício em um perfil separado. Escolha uma aula, avance alguns segundos, feche a janela e abra novamente com `npm.cmd run demo`. O botão **Continuar** deve retomar a aula salva.

Em **Preferências**, escolha **Dispositivo**, **Claro**, **Escuro** ou **Personalizado**. As paletas Rosa, Azul, Verde e Roxo vêm do Organon. O botão de sol ou lua na barra superior alterna entre Claro e Escuro.

Para testar com uma conta, execute `npm.cmd start` na mesma pasta. Gere um API ID e um API hash de desenvolvimento em [my.telegram.org](https://my.telegram.org/apps), conecte sua conta e use **Importar canal**. Se a conta tiver verificação em duas etapas, informe a senha na janela do app.

Depois de importar um canal ao qual você já tem acesso, abra uma aula, avance para o meio do vídeo, feche o app e volte pelo botão **Continuar**. Confira se a aula retoma do ponto salvo e se o tempo restante diminuiu. As aulas aparecem na ordem das postagens e o capítulo é extraído da legenda quando ela contém “Capítulo” seguido por um número.

## Como os dados funcionam

- A sessão fica em `sessao.bin`, protegida pelo Electron `safeStorage` no perfil local do Windows. O código de login e a senha de duas etapas são usados apenas durante a autenticação.
- Cada conta tem seu próprio `biblioteca-<id>.json`, com o catálogo importado, os identificadores das postagens, a duração e o progresso. A pasta fica sob `%APPDATA%\Player de Aulas`. Desconectar encerra a sessão e preserva a biblioteca. Remover um curso apaga o catálogo e o progresso daquele curso.
- O player lê os vídeos do Telegram em partes, pela conexão da conta. Os trechos passam pelo processo do app e são entregues ao player por um protocolo interno. O curso inteiro não precisa ser baixado.
- O aplicativo atualiza a posição durante a reprodução, ao pausar e ao avançar no vídeo. A duração restante soma o tempo das aulas pendentes e desconta a posição registrada em cada uma.

Para testar com uma conta real a partir da pasta do projeto, execute `npm.cmd start` no PowerShell. Execute `npm.cmd run check` para as verificações locais e `npm.cmd run dist` para gerar o instalador da versão configurada. Consulte [as pendências](PENDENCIAS.md) para o que ainda precisa de validação.
