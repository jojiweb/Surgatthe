# Baixador de Clipes do YouTube

App simples com janela (GUI) para Windows que baixa vídeo e/ou áudio do
YouTube, com opção de cortar um trecho específico (início/fim). Usa
[yt-dlp](https://github.com/yt-dlp/yt-dlp) para o download e
[ffmpeg](https://ffmpeg.org/) para juntar/cortar/converter os arquivos.

> Use para baixar conteúdo que você tem direito de usar (seus próprios
> vídeos, conteúdo com licença livre/Creative Commons, ou dentro dos
> limites de uso justo). A responsabilidade pelo uso do material baixado
> é de quem usa a ferramenta.

## Pré-requisitos (Windows)

1. **Python 3.9+**
   - Baixe em https://www.python.org/downloads/windows/
   - No instalador, marque a opção **"Add python.exe to PATH"**.

2. **ffmpeg**
   - Forma mais fácil, pelo terminal (PowerShell ou CMD):
     ```
     winget install ffmpeg
     ```
   - Alternativa manual: baixe um build estático em
     https://www.gyan.dev/ffmpeg/builds/ (seção "release full"),
     extraia o `.zip` e adicione a pasta `bin` ao PATH do Windows
     (Painel de Controle → Sistema → Configurações avançadas →
     Variáveis de Ambiente → `Path`).
   - Para confirmar que funcionou, abra um novo terminal e rode:
     ```
     ffmpeg -version
     ```

## Instalação do app

Abra o terminal (PowerShell) dentro da pasta `youtube-clip-downloader` e rode:

```
pip install -r requirements.txt
```

## Como usar

```
python app.py
```

Isso abre a janela do app:

1. Cole o link do vídeo do YouTube.
2. Escolha **Vídeo**, **Áudio** ou **Ambos**.
3. Escolha a resolução do vídeo e/ou o formato de áudio (MP3, M4A ou WAV).
4. Se quiser só um trecho, marque **"Baixar só um trecho do vídeo"** e
   informe o início e o fim (formato `MM:SS` ou `HH:MM:SS`, ex: `1:20` e `1:45`).
5. Escolha a pasta de destino (padrão: `Vídeos\Clipes` na sua pasta de usuário).
6. Clique em **Baixar** e acompanhe o progresso no log da própria janela.

## Dicas

- Quando você corta um trecho (início/fim), o `yt-dlp` tenta baixar
  apenas a parte necessária do vídeo (mais rápido), usando o `ffmpeg`
  para cortar com precisão nos keyframes mais próximos.
- No modo **Ambos**, o app salva um arquivo de vídeo (com áudio, `.mp4`)
  e, separadamente, um arquivo de áudio extraído no formato escolhido.
- Se aparecer erro tipo `ffmpeg not found` ou `WinError 2`, é sinal de
  que o ffmpeg não está no PATH — revise o passo 2 dos pré-requisitos.
- Links de playlist funcionam, mas o app foi pensado para baixar um
  vídeo/clipe por vez.

## Gerar um .exe (opcional)

Se no futuro você quiser um único `.exe` sem precisar ter Python instalado:

```
pip install pyinstaller
pyinstaller --onefile --windowed --name "BaixadorDeClipes" app.py
```

O executável fica em `dist/BaixadorDeClipes.exe`.
