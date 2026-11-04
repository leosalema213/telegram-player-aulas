!include "nsDialogs.nsh"

; Older app versions send these flags without /S. Keep their updates silent too.
; Opening the installer normally still shows the full first-install wizard.
!macro customInit
  ${If} ${isUpdated}
  ${AndIf} ${isForceRun}
    SetSilent silent
  ${EndIf}
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Bem-vindo ao Player de Aulas"
  !define MUI_WELCOMEPAGE_TEXT "Organize e assista às aulas de canais do Telegram.$\r$\n$\r$\nO catálogo e o progresso ficam neste computador.$\r$\n$\r$\nNas próximas etapas, escolha onde instalar e confirme a instalação.$\r$\n$\r$\nClique em Próximo para continuar."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customPageAfterChangeDir
  Page custom PlayerAulasConfirmPage
  Function PlayerAulasConfirmPage
    !insertmacro MUI_HEADER_TEXT "Confirmar instalação" "Confira a pasta antes de instalar."
    ; Match electron-builder's directory normalization before showing the final path.
    ${StrContains} $1 "${APP_FILENAME}" $INSTDIR
    ${If} $1 == ""
      StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"
    ${EndIf}
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 8u 100% 22u "O Player de Aulas será instalado nesta pasta:"
    Pop $0
    ${NSD_CreateLabel} 0 34u 100% 42u "$INSTDIR"
    Pop $0
    ${NSD_CreateLabel} 0 86u 100% 36u "Clique em Instalar para confirmar, ou em Voltar para alterar a pasta."
    Pop $0
    GetDlgItem $1 $HWNDPARENT 1
    SendMessage $1 ${WM_SETTEXT} 0 "STR:Instalar"
    nsDialogs::Show
  FunctionEnd
!macroend

!macro customFinishPage
  Function PlayerAulasStartApp
    ${If} ${isUpdated}
      StrCpy $1 "--updated"
    ${Else}
      StrCpy $1 ""
    ${EndIf}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd
  !define MUI_FINISHPAGE_TITLE "Instalado com sucesso"
  !define MUI_FINISHPAGE_TEXT "O Player de Aulas está pronto para usar.$\r$\n$\r$\nDeseja abrir o aplicativo? Marque a opção abaixo e clique em Concluir."
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_NOTCHECKED
  !define MUI_FINISHPAGE_RUN_TEXT "Abrir o Player de Aulas agora"
  !define MUI_FINISHPAGE_RUN_FUNCTION "PlayerAulasStartApp"
  !insertmacro MUI_PAGE_FINISH
!macroend
