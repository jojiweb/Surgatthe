# Baixador de Clipes do YouTube

App simples com janela (GUI) para Windows que baixa vídeo ou áudio do
YouTube, com opção de cortar um trecho específico (início/fim), e que
também **comprime arquivos de vídeo** sem perda visível de qualidade. Usa
[yt-dlp](https://github.com/yt-dlp/yt-dlp) para o download e
[ffmpeg](https://ffmpeg.org/) para juntar/cortar/converter/comprimir os
arquivos.

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

Isso abre a janela do app, que tem duas abas: **BAIXAR** e **COMPRIMIR**.

### Aba BAIXAR

1. Cole o link do vídeo do YouTube.
2. Escolha **Vídeo (com áudio)** ou **Só áudio**.
3. Escolha a resolução do vídeo ou o formato de áudio (MP3, M4A ou WAV).
4. Se quiser só um trecho, marque **"Baixar só um trecho do vídeo"** e
   informe o início e o fim. Os campos funcionam como um cronômetro: os
   números digitados entram pela direita e empurram os anteriores (ex:
   digitar `4`, `2`, `5` forma `0:04` → `0:42` → `4:25`). Backspace apaga o
   último dígito.
5. Se quiser, digite um **nome de arquivo** (opcional). Deixe em branco
   para usar o título do vídeo.
6. Escolha a pasta de destino. Ela fica salva: na próxima vez que abrir o
   app, a última pasta usada já vem preenchida (na primeira vez, o padrão
   é `Vídeos\Clipes` na sua pasta de usuário).
7. Clique em **BAIXAR** e acompanhe o progresso no log da própria janela.

### Aba COMPRIMIR

Reduz o tamanho de um arquivo de vídeo que você já tem, sem perda visível
de qualidade.

1. Clique em **Escolher...** e selecione o vídeo.
2. Escolha a **qualidade**:
   - **Sem perda visível** — CRF 18, o ponto em que o olho não distingue
     do original. Comprime menos.
   - **Alta qualidade (recomendado)** — CRF 20, ótimo equilíbrio.
   - **Equilibrado (arquivo bem menor)** — CRF 23, ainda com boa qualidade.
3. Escolha o **codec**:
   - **H.264** — compatível com praticamente qualquer player/editor.
   - **H.265** — gera arquivo bem menor na mesma qualidade, mas demora
     mais para processar e nem todo player aceita.
4. Clique em **COMPRIMIR**. O resultado é salvo ao lado do original, com
   o sufixo `_comprimido.mp4`.

O arquivo original **nunca** é apagado nem sobrescrito. O áudio é copiado
sem recodificar sempre que o formato permite (zero perda no som); quando
não dá, é convertido para AAC 192 kbps.

## Dicas

- Quando você corta um trecho (início/fim), o `yt-dlp` tenta baixar
  apenas a parte necessária do vídeo (mais rápido), usando o `ffmpeg`
  para cortar com precisão nos keyframes mais próximos.
- O modo **Vídeo** já baixa o arquivo com o áudio junto (`.mp4`), então
  não é preciso baixar o áudio separado para ter som.
- Comprimir um vídeo que **já estava bem comprimido** (um download do
  YouTube, por exemplo) pode deixá-lo *maior*, não menor — recomprimir só
  vale a pena para arquivos "pesados", como gravações de tela, exports de
  editor ou vídeos de celular/câmera. Se isso acontecer, o app avisa no
  resultado e o original continua intacto.
- Se aparecer erro tipo `ffmpeg not found` ou `WinError 2` **mesmo depois de
  instalar o ffmpeg**, feche completamente o terminal/janela que está
  rodando o app e abra um novo — o Windows só propaga a atualização do
  PATH feita pelo instalador (`winget install ffmpeg`) para janelas e
  processos abertos **depois** da instalação. O app também tenta localizar
  o ffmpeg sozinho (inclusive o link criado pelo winget) mesmo se o PATH
  ainda não tiver sido atualizado, e mostra no log se encontrou ou não.
- Links de playlist funcionam, mas o app foi pensado para baixar um
  vídeo/clipe por vez.

## Gerar um .exe (opcional)

Se no futuro você quiser um único `.exe` sem precisar ter Python instalado:

```
pip install pyinstaller
pyinstaller --onefile --windowed --name "BaixadorDeClipes" app.py
```

O executável fica em `dist/BaixadorDeClipes.exe`.
