# Pendências

- [ ] Conferir na versão 0.1.6 o avanço e o retrocesso pela barra em arquivos de áudio reais longos e a abertura do vídeo da Biblioteca em 1×. A prévia foi aprovada, e o teste em demonstração conferiu a busca no áudio e as velocidades após reabrir.

- [ ] Validar a prévia 0.1.5-preview.1 em curso real: lista de aulas alinhada à altura do player, materiais logo abaixo, busca, rolagem até a última aula, redimensionamento e modo teatro.

- [ ] Validar login com código, login com duas etapas, reconexão e desconexão em uma conta de teste.
- [ ] Importar um canal real e conferir títulos, duração e sequência dos capítulos. Testar a reprodução e o salto para o meio de um vídeo grande.
- [ ] Conferir os termos da API antes de distribuir, incluindo API ID próprio, apresentação da integração e suporte a mensagens patrocinadas em canais. [Termos da API do Telegram](https://core.telegram.org/api/terms)
- [x] Gerar e validar o instalador de prévia do Windows em um perfil separado (0.1.0-preview.7: instalação inicial, reinstalação e abertura em modo demonstração).
- [ ] Validar o fluxo de download e reinício pelo app em uma próxima versão. A primeira Release estável e seus metadados foram conferidos; a prévia detectou a versão 0.1.0 no canal real.
- [ ] Inspecionar abertura do link e seletores de país e canais nas paletas, inclusive navegação por teclado; validar os formatos de telefone na interface. O seletor inicial cobre Brasil, Portugal, Estados Unidos e Reino Unido.
- [ ] Validar o fluxo completo de descoberta, download e reinício para atualização com uma fonte de teste; a atualização da prévia 0.1.0-preview.7 para a estável 0.1.0 preservou arquivos de perfil isolados, e a falha com nova tentativa foi simulada no atualizador.
- [ ] Implementar e validar suporte a mensagens patrocinadas em canais e conferir os demais requisitos dos termos da API do Telegram antes de considerar a integração adequada para distribuição ampla.
- [ ] Validar em um canal real a importação e atualização de documentos, download, arquivo indisponível e nova tentativa; confirmar que a atualização mantém o progresso existente. Os documentos são exibidos por curso e não são associados automaticamente a uma aula.
- [ ] Validar em aulas reais a conclusão automática no fim, controles do player e velocidade entre aulas/cursos e após reiniciar. Medir consumo em uso contínuo com vídeo real.
- [ ] Validar em canal real a retomada pausada da última aula ao abrir, as velocidades personalizadas e o modo teatro da prévia 0.1.1-preview.2.
- [ ] Validar os botões Anterior e Próxima em canal real, inclusive no modo teatro, antes de publicar a prévia 0.1.3.
- [ ] Validar em vídeo real as setas de cinco segundos com foco no vídeo, inclusive no modo teatro, antes de publicar a prévia 0.1.3-preview.2.
- [ ] Validar em conta real a sidebar recolhida, o alinhamento de Dados locais e os ícones da prévia 0.1.3-preview.3 antes da publicação.
- [ ] Validar em cursos reais que a prévia 0.1.2-preview.2 prepara a aula de Continuar também ao trocar de curso e ao retornar da Tela inicial.
- [ ] Validar anotações em cursos reais, incluindo falha de gravação e reimportação. O caderno usa editor próprio inspirado no Organon; a inserção de várias imagens de uma vez e a manipulação avançada de imagens ainda não têm paridade completa.
- [ ] Confirmar preservação do perfil efetivamente usado pelo aplicativo instalado durante uma atualização: os testes anteriores de instalador conferiram arquivos artificiais, mas a variável APPDATA sozinha não garantiu o isolamento do perfil Electron.
- [ ] Validar em instalação real a limpeza do cache de atualizações após a abertura da nova versão, incluindo arquivo bloqueado e nova tentativa na abertura seguinte.
- [ ] Validar a playlist em mídia real, incluindo importação de áudios, vídeos e imagens, reprodução sequencial, modal de vídeo, pastas e subpastas, reordenação, exclusão e preservação após reimportar o curso.
- [x] Confirmar acesso de escrita ao origin e publicar a primeira versão estável com instalador e SHA-256 após autorização do usuário.
