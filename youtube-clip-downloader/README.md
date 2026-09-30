# Baixador de Clipes do YouTube

App simples com janela (GUI) para Windows que baixa vídeos do YouTube —
um link ou uma **playlist inteira** (escolhendo só os vídeos que quiser) —
em vídeo com áudio, vídeo sem áudio ou só áudio. Ao colar o link, o app
mostra qual é o vídeo (miniatura, título, canal, duração). Usa
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

Isso abre a janela do app. Cole um link do YouTube no campo de cima: o app
consulta o YouTube sozinho (ou clique em **Buscar**) e mostra o que é.

### Link de um vídeo

1. Aparece a miniatura, o título, o canal e a duração do vídeo.
2. Escolha o formato: **Vídeo (com áudio)**, **Vídeo (sem áudio)** ou
   **Só áudio**, e a resolução (vídeo) ou o formato de áudio (MP3, M4A, WAV).
3. Opcional — **cortar um trecho**: marque "Baixar só um trecho" e informe
   início e fim. Os campos funcionam como um cronômetro: os números
   digitados entram pela direita e empurram os anteriores (ex: digitar
   `4`, `2`, `5` forma `0:04` → `0:42` → `4:25`). Backspace apaga o último.
4. Opcional — **nome do arquivo**. Em branco = título do vídeo.
5. Escolha a pasta de destino (a última usada fica salva para a próxima vez;
   na primeira, o padrão é `Vídeos\Clipes`) e clique em **Baixar**.

### Link de playlist

1. Todos os vídeos aparecem numa lista, já marcados, cada um com miniatura,
   título e duração. Se o link era de um vídeo *dentro* da playlist (tem
   `v=` e `list=`), a playlist inteira é listada e esse vídeo vem destacado.
2. **Escolha o que baixar:** clique numa linha para marcar/desmarcar (ou use
   Espaço), ou use **Marcar todos** / **Desmarcar todos**. Vídeos privados,
   apagados ou ao vivo aparecem em cinza e não podem ser marcados.
3. **Escolha o formato:**
   - **Para todos de uma vez:** troque a opção em *Formato* (vídeo com áudio,
     sem áudio ou só áudio) — ela vale para todos os vídeos da lista.
   - **Por vídeo:** clique na coluna **Formato** de uma linha e escolha —
     por exemplo, um vídeo só em áudio e outro em vídeo com áudio.
4. Clique em **Baixar N vídeos**. Eles são baixados **um por um,
   automaticamente**, cada arquivo com o nome do vídeo; a coluna *Status*
   mostra o andamento (Baixando 45%, Concluído ✓, Erro...) e a barra mostra
   o progresso geral. Se um vídeo falhar, a fila continua nos próximos.
5. **Cancelar** interrompe o vídeo atual e o resto da fila; o que já foi
   baixado fica salvo e arquivos incompletos são apagados.

Em playlists, o corte de trecho e o nome personalizado ficam ocultos (só
valem para um vídeo).

## Dicas

- Quando você corta um trecho (início/fim), o `yt-dlp` tenta baixar
  apenas a parte necessária do vídeo (mais rápido), usando o `ffmpeg`
  para cortar com precisão nos keyframes mais próximos. Durante o corte a
  barra fica em "vai e vem" e o **Cancelar** só faz efeito quando o corte
  atual terminar.
- **Vídeo (sem áudio)** é útil pra quem vai editar o clipe depois e não
  quer carregar uma faixa de áudio que vai descartar de qualquer forma. O
  arquivo ganha o sufixo ` (sem áudio)` no nome, para não confundir (nem
  ser pulado) se você também baixar o mesmo vídeo com áudio.
- Se um arquivo com o mesmo nome já existir, o app **não baixa de novo** e
  marca "Já existia". (Exceção: no modo *Só áudio* o vídeo é baixado de novo
  e o arquivo de áudio é sobrescrito, com o mesmo resultado.) Se dois vídeos
  da mesma lista tiverem exatamente o mesmo título e formato, o segundo
  recebe ` [id]` no nome.
- Links de canal (`/@canal`), da lista "Assistir mais tarde" e de "Vídeos
  curtidos" (exigem login) não são suportados; o app avisa na hora.
- Sem a biblioteca Pillow (`pip install -r requirements.txt` instala) o app
  funciona normalmente, só que sem as miniaturas.
- Se aparecer erro tipo `ffmpeg not found` ou `WinError 2` **mesmo depois de
  instalar o ffmpeg**, feche completamente o terminal/janela que está
  rodando o app e abra um novo — o Windows só propaga a atualização do
  PATH feita pelo instalador (`winget install ffmpeg`) para janelas e
  processos abertos **depois** da instalação. O app também tenta localizar
  o ffmpeg sozinho (inclusive o link criado pelo winget) mesmo se o PATH
  ainda não tiver sido atualizado, e mostra no log se encontrou ou não.

## Gerar um .exe (opcional)

Se no futuro você quiser um único `.exe` sem precisar ter Python instalado:

```
pip install pyinstaller
pyinstaller --onefile --windowed --name "BaixadorDeClipes" app.py
```

O executável fica em `dist/BaixadorDeClipes.exe`.
