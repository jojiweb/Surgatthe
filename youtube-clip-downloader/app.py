"""
Baixador de Clipes do YouTube
=============================

App simples com janela (Tkinter) para baixar vídeos do YouTube: cole o link
de um vídeo ou de uma playlist, veja o que é (miniatura, título, duração),
escolha quais vídeos baixar e em que formato (vídeo com áudio, vídeo sem
áudio ou só áudio — por vídeo ou para todos de uma vez). Os downloads rodam
um por um, automaticamente, e cada arquivo leva o nome do vídeo. Para um
vídeo único também dá para cortar um trecho e escolher o nome do arquivo.
Usa yt-dlp + ffmpeg.

Como rodar:
    pip install -r requirements.txt
    python app.py

Requer o ffmpeg instalado e disponível no PATH do Windows
(veja instruções no README.md).
"""

from __future__ import annotations

import io
import json
import os
import queue
import re
import shutil
import threading
import tkinter as tk
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from tkinter import ttk, filedialog, messagebox
from urllib.parse import parse_qs, urlparse

from yt_dlp import YoutubeDL
from yt_dlp.postprocessor.ffmpeg import FFmpegPostProcessor
from yt_dlp.utils import DownloadCancelled, download_range_func

try:
    from PIL import Image, ImageTk
except ImportError:  # sem Pillow o app funciona, só que sem miniaturas
    Image = ImageTk = None

DEFAULT_OUTPUT_DIR = os.path.join(os.path.expanduser("~"), "Videos", "Clipes")

CONFIG_DIR = os.path.join(os.getenv("APPDATA") or os.path.expanduser("~"), "BaixadorDeClipesYT")
CONFIG_PATH = os.path.join(CONFIG_DIR, "config.json")

RESOLUTIONS = {
    "Melhor disponível": None,
    "1080p": 1080,
    "720p": 720,
    "480p": 480,
    "360p": 360,
}

AUDIO_FORMATS = ["mp3", "m4a", "wav"]

MODE_LABELS = {
    "video": "Vídeo + áudio",
    "video_noaudio": "Só vídeo",
    "audio": "Só áudio",
}

TIME_PATTERN = re.compile(r"^(?:(\d+):)?(\d{1,2}):(\d{2})$|^(\d+)$")

INVALID_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
VIDEO_ID_RE = re.compile(r"^[\w-]{11}$")

YT_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
            "youtu.be", "www.youtu.be"}

UNAVAILABLE_TITLES = {"[private video]", "[deleted video]"}
UNAVAILABLE_AVAILABILITY = {"private", "needs_auth", "premium_only", "subscriber_only"}
UNAVAILABLE_LIVE = {"is_live", "is_upcoming"}

ROW_THUMB = (80, 45)
CARD_THUMB = (176, 99)
BIG_QUEUE = 25  # acima disso o app pede confirmação antes de baixar

# --- Paleta moderna e minimalista ---------------------------------------
BG = "#f7f7f8"
PANEL_BG = "#ffffff"
FIELD_BG = "#ffffff"
DISABLED_BG = "#e2e4e8"
BORDER = "#e2e4e8"
ACCENT = "#2563eb"
ACCENT_HOVER = "#1d4ed8"
SECONDARY_BG = "#eef0f3"
SECONDARY_HOVER = "#e2e4e8"
SELECT_BG = "#dbeafe"
LINK_ROW_BG = "#eff6ff"
TEXT = "#1f2328"
TEXT_DIM = "#6b7280"
ERROR_FG = "#b91c1c"
OK_FG = "#15803d"
LOG_FG = "#374151"
PLACEHOLDER = "#e5e7eb"
FONT = "Segoe UI"


# ---------------------------------------------------------------------------
# Helpers puros (sem Tk)
# ---------------------------------------------------------------------------

def sanitize_filename(name: str) -> str:
    """Remove caracteres inválidos em nomes de arquivo do Windows e escapa
    '%' para não ser interpretado como campo de template pelo yt-dlp."""
    name = INVALID_FILENAME_CHARS.sub("", name).strip(" .")
    return name.replace("%", "%%")


def find_ffmpeg() -> str | None:
    """Localiza o ffmpeg mesmo quando ele foi instalado (ex: via winget)
    depois que este processo/terminal já estava aberto: nesses casos o
    PATH do Windows só é atualizado em janelas de terminal novas, então
    `shutil.which` sozinho não encontra o executável recém-instalado."""
    found = shutil.which("ffmpeg")
    if found:
        return found

    candidates = [
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe"),
        os.path.expandvars(r"%ProgramFiles%\ffmpeg\bin\ffmpeg.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\ffmpeg\bin\ffmpeg.exe"),
        os.path.expandvars(r"%ChocolateyInstall%\bin\ffmpeg.exe"),
    ]

    winget_pkgs = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages")
    if os.path.isdir(winget_pkgs):
        for entry in os.listdir(winget_pkgs):
            if entry.lower().startswith("gyan.ffmpeg"):
                pkg_dir = os.path.join(winget_pkgs, entry)
                for root_dir, _dirs, files in os.walk(pkg_dir):
                    if "ffmpeg.exe" in files:
                        candidates.append(os.path.join(root_dir, "ffmpeg.exe"))

    for path in candidates:
        if path and os.path.isfile(path):
            return path
    return None


def load_last_output_dir() -> str:
    """Lê a última pasta de destino usada, salva na sessão anterior."""
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        saved = data.get("output_dir")
        if saved:
            return saved
    except (OSError, ValueError):
        pass
    return DEFAULT_OUTPUT_DIR


def save_last_output_dir(path: str) -> None:
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump({"output_dir": path}, f)
    except OSError:
        pass


def parse_time(value: str):
    """Aceita HH:MM:SS, MM:SS, ou segundos puros. Retorna segundos (float) ou None."""
    value = value.strip()
    if not value:
        return None
    match = TIME_PATTERN.match(value)
    if not match:
        raise ValueError(f"Tempo inválido: '{value}'. Use MM:SS, HH:MM:SS ou segundos.")
    if match.group(4) is not None:
        return float(match.group(4))
    hours = int(match.group(1)) if match.group(1) else 0
    minutes = int(match.group(2))
    seconds = int(match.group(3))
    return hours * 3600 + minutes * 60 + seconds


def format_duration(seconds) -> str:
    if not isinstance(seconds, (int, float)):
        return "—"
    total = int(seconds)
    hours, rest = divmod(total, 3600)
    minutes, secs = divmod(rest, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes}:{secs:02d}"


def clean_error_text(exc) -> str:
    """Tira códigos de cor ANSI e o prefixo 'ERROR:' das mensagens do yt-dlp."""
    text = ANSI_RE.sub("", str(exc)).strip()
    text = re.sub(r"^ERROR:\s*", "", text)
    return text[:300]


@dataclass
class UrlInfo:
    kind: str  # video | playlist | channel | invalid
    video_id: str | None = None
    list_id: str | None = None
    reason: str = ""


def parse_youtube_url(url: str) -> UrlInfo:
    """Descobre se o texto colado é um vídeo, uma playlist, um canal ou lixo.
    Sem rede: só olha a URL. Com 'list=' vira playlist (guardando o 'v='
    para destacar o vídeo do link)."""
    raw = url.strip()
    if not raw:
        return UrlInfo("invalid")
    if "://" not in raw:
        raw = "https://" + raw
    try:
        parsed = urlparse(raw)
        host = (parsed.hostname or "").lower()
    except ValueError:
        return UrlInfo("invalid", reason="Não reconheci esse link.")
    if host not in YT_HOSTS:
        return UrlInfo("invalid", reason="Esse link não é do YouTube.")

    query = parse_qs(parsed.query)
    list_id = (query.get("list") or [None])[0]
    path = parsed.path.rstrip("/")

    video_id = None
    if host.endswith("youtu.be"):
        video_id = path.lstrip("/").split("/")[0] or None
    elif path == "/watch":
        video_id = (query.get("v") or [None])[0]
    else:
        match = re.match(r"^/(?:shorts|live|embed|v)/([\w-]{11})", path)
        if match:
            video_id = match.group(1)
    if video_id and not VIDEO_ID_RE.match(video_id):
        video_id = None

    if list_id:
        if list_id in ("WL", "LL"):
            return UrlInfo(
                "invalid", video_id, list_id,
                "Essa lista (Assistir mais tarde / Vídeos curtidos) exige login "
                "no YouTube e o app não consegue lê-la.")
        return UrlInfo("playlist", video_id, list_id)
    if video_id:
        return UrlInfo("video", video_id)
    if re.match(r"^/(@|channel/|c/|user/)", path):
        return UrlInfo("channel", reason="Links de canal ainda não são suportados. "
                                         "Cole o link de um vídeo ou de uma playlist.")
    return UrlInfo("invalid", reason="Não reconheci esse link como vídeo ou playlist do YouTube.")


def canonical_target(info: UrlInfo) -> str:
    if info.kind == "playlist":
        if info.video_id:
            return f"https://www.youtube.com/watch?v={info.video_id}&list={info.list_id}"
        return f"https://www.youtube.com/playlist?list={info.list_id}"
    return f"https://www.youtube.com/watch?v={info.video_id}"


def fetch_url_info(info: UrlInfo) -> dict:
    """Consulta o YouTube (sem baixar nada). Roda em thread."""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": "in_playlist",
        "socket_timeout": 15,
        "noplaylist": info.kind == "video",
    }
    with YoutubeDL(opts) as ydl:
        return ydl.extract_info(canonical_target(info), download=False)


def friendly_fetch_error(exc) -> str:
    text = clean_error_text(exc)
    low = text.lower()
    if any(w in low for w in ("private", "sign in", "log in", "login", "cookies")):
        return "Esse conteúdo é privado ou exige login no YouTube."
    if any(w in low for w in ("urlopen", "getaddrinfo", "timed out", "network",
                              "connection", "unable to download webpage")):
        return "Sem conexão com o YouTube. Verifique a internet e tente de novo."
    if any(w in low for w in ("does not exist", "not available", "unavailable", "404")):
        return "Não encontrei esse vídeo/playlist (removido ou inexistente)."
    return f"Não consegui ler esse link: {text[:140]}"


@dataclass
class Item:
    id: str
    url: str
    title: str
    duration: float | None = None
    channel: str = ""
    available: bool = True
    reason: str = ""


def normalize_item(entry: dict) -> Item | None:
    vid = entry.get("id") or ""
    if not VIDEO_ID_RE.match(vid):
        return None
    title = (entry.get("title") or "").strip()
    reason = ""
    if title.lower() in UNAVAILABLE_TITLES or entry.get("availability") in UNAVAILABLE_AVAILABILITY:
        reason = "Indisponível"
    elif entry.get("live_status") in UNAVAILABLE_LIVE:
        reason = "Ao vivo"
    duration = entry.get("duration")
    return Item(
        id=vid,
        url=f"https://www.youtube.com/watch?v={vid}",
        title=title or vid,
        duration=float(duration) if isinstance(duration, (int, float)) else None,
        channel=entry.get("channel") or entry.get("uploader") or "",
        available=not reason,
        reason=reason,
    )


def normalize_entries(info: dict) -> tuple[str, list[Item]]:
    items = []
    for entry in info.get("entries") or []:
        if entry:
            item = normalize_item(entry)
            if item:
                items.append(item)
    return info.get("title") or "Playlist", items


def fetch_thumbnail(video_id: str) -> bytes | None:
    """mqdefault (320x180) — o default.jpg tem barras pretas."""
    url = f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.read()
    except Exception:  # noqa: BLE001 - miniatura é opcional
        return None


def decode_thumbnail(data: bytes, size: tuple[int, int]):
    if Image is None or not data:
        return None
    try:
        return Image.open(io.BytesIO(data)).convert("RGB").resize(size)
    except Exception:  # noqa: BLE001
        return None


def build_format_opts(mode: str, height: int | None, audio_fmt: str) -> dict:
    if mode == "audio":
        return {
            "format": "bestaudio/best",
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": audio_fmt,
                "preferredquality": "192",
            }],
        }
    if mode == "video_noaudio":
        return {"format": f"bestvideo[height<={height}]" if height else "bestvideo"}
    fmt = (f"bestvideo[height<={height}]+bestaudio/best[height<={height}]"
           if height else "bestvideo+bestaudio/best")
    return {"format": fmt, "merge_output_format": "mp4"}


def build_outtmpl(out_dir: str, mode: str, custom_name: str | None,
                  title: str, video_id: str, taken: set | None) -> str:
    """Nome do arquivo: título do vídeo (ou o nome escolhido, se houver).
    'Só vídeo' ganha o sufixo ' (sem áudio)' — senão colidiria com o
    'Vídeo + áudio' do mesmo vídeo (ambos .mp4) e o yt-dlp pularia o
    download achando que já existe. Se dois itens da fila tiverem o mesmo
    título/formato, o segundo recebe ' [id]'."""
    if custom_name:
        base = sanitize_filename(custom_name)
    else:
        base = "%(title)s"
        if mode == "video_noaudio":
            base += " (sem áudio)"
        key = (title.strip().lower(), mode)
        if taken is not None:
            if key in taken:
                base += f" [{video_id}]"
            taken.add(key)
    return os.path.join(out_dir, f"{base}.%(ext)s")


@dataclass
class QueueItem:
    iid: str
    video_id: str
    url: str
    title: str
    mode: str


@dataclass
class DownloadJob:
    ffmpeg: str | None
    out_dir: str
    height: int | None
    audio_fmt: str
    start_s: float | None
    end_s: float | None
    custom_name: str
    items: list


class ItemRun:
    """Acompanha o download de UM item: converte os hooks do yt-dlp em
    eventos, detecta 'já existia' (via logger) e sabe limpar arquivos
    parciais se o usuário cancelar."""

    def __init__(self, item: QueueItem, emit, cancel: threading.Event):
        self.item = item
        self.emit = emit
        self.cancel = cancel
        self.n_streams = 2 if item.mode == "video" else 1  # vídeo+áudio baixa 2 streams
        self.finished: set = set()
        self.paths: set = set()
        self.best = 0.0
        self.already = False

    # interface de logger do yt-dlp
    def debug(self, msg):
        if "has already been downloaded" in str(msg):
            self.already = True

    info = debug

    def warning(self, msg):
        pass

    def error(self, msg):
        pass

    def progress_hook(self, d):
        status = d.get("status")
        for key in ("filename", "tmpfilename"):
            if d.get(key):
                self.paths.add(d[key])
        if status == "downloading":
            if self.cancel.is_set():
                raise DownloadCancelled("Cancelado pelo usuário")
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            pct = (d.get("downloaded_bytes") or 0) / total if total else 0.0
            self._report((len(self.finished) + min(pct, 1.0)) / self.n_streams)
        elif status == "finished":
            self.finished.add(d.get("filename"))
            self._report(len(self.finished) / self.n_streams)

    def postprocessor_hook(self, d):
        if d.get("status") == "started":
            self.emit("converting", (self.item.iid,))

    def _report(self, fraction):
        self.best = max(self.best, min(fraction, 1.0))
        self.emit("progress", (self.item.iid, self.best))

    def cleanup(self):
        """Apaga .part/.ytdl e streams intermediários do item cancelado."""
        bases = set()
        for path in self.paths:
            bases.add(path[:-5] if path.endswith(".part") else path)
        for base in bases:
            for candidate in (base, base + ".part", base + ".ytdl"):
                try:
                    os.remove(candidate)
                except OSError:
                    pass


def build_ydl_opts(job: DownloadJob, item: QueueItem, outtmpl: str, run: ItemRun) -> dict:
    opts = {
        "outtmpl": outtmpl,
        "progress_hooks": [run.progress_hook],
        "postprocessor_hooks": [run.postprocessor_hook],
        "logger": run,
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
    }
    if job.ffmpeg:
        opts["ffmpeg_location"] = job.ffmpeg
    if job.start_s is not None and job.end_s is not None:
        opts["download_ranges"] = download_range_func(None, [(job.start_s, job.end_s)])
        opts["force_keyframes_at_cuts"] = True
    opts.update(build_format_opts(item.mode, job.height, job.audio_fmt))
    return opts


def run_download_queue(job: DownloadJob, emit, cancel: threading.Event) -> dict:
    """Baixa os itens um por um. Roda em thread e só se comunica por
    emit(tipo, payload) — nunca toca no Tk."""
    if job.ffmpeg:
        # A checagem interna do yt-dlp para cortes ignora a opção
        # 'ffmpeg_location' e só lê esta variável de contexto (a CLI do
        # yt-dlp a define assim). Precisa ser dentro da thread que baixa.
        FFmpegPostProcessor._ffmpeg_location.set(job.ffmpeg)

    total = len(job.items)
    counts = {"ok": 0, "exists": 0, "error": 0, "cancelled": 0}
    taken: set = set()

    for index, item in enumerate(job.items):
        if cancel.is_set():
            counts["cancelled"] += 1
            emit("item", (item.iid, "cancelled", "Cancelado", ""))
            continue

        emit("start", (index, total, item.iid, item.title))
        if job.start_s is not None:
            emit("indeterminate", (item.iid,))  # o corte usa ffmpeg direto, sem hooks

        outtmpl = build_outtmpl(job.out_dir, item.mode, job.custom_name,
                                item.title, item.video_id, taken)
        run = ItemRun(item, emit, cancel)
        try:
            with YoutubeDL(build_ydl_opts(job, item, outtmpl, run)) as ydl:
                ydl.download([item.url])
        except DownloadCancelled:
            run.cleanup()
            counts["cancelled"] += 1
            emit("item", (item.iid, "cancelled", "Cancelado", ""))
        except Exception as exc:  # noqa: BLE001 - um item com erro não para a fila
            counts["error"] += 1
            emit("item", (item.iid, "error", "Erro", clean_error_text(exc)))
        else:
            if run.already:
                counts["exists"] += 1
                emit("item", (item.iid, "exists", "Já existia", ""))
            else:
                counts["ok"] += 1
                emit("item", (item.iid, "done", "Concluído ✓", ""))

    emit("done", counts)
    return counts


def summarize_counts(counts: dict) -> str:
    parts = []
    if counts["ok"]:
        parts.append(f"{counts['ok']} concluído{'s' if counts['ok'] != 1 else ''}")
    if counts["exists"]:
        parts.append(f"{counts['exists']} já existia{'m' if counts['exists'] != 1 else ''}")
    if counts["error"]:
        parts.append(f"{counts['error']} com erro")
    if counts["cancelled"]:
        parts.append(f"{counts['cancelled']} cancelado{'s' if counts['cancelled'] != 1 else ''}")
    return ", ".join(parts) or "nada baixado"


# ---------------------------------------------------------------------------
# Widgets
# ---------------------------------------------------------------------------

class TimeMaskEntry(tk.Entry):
    """Campo de tempo estilo cronômetro: cada dígito digitado entra pela
    direita e empurra os anteriores para a esquerda (ex: digitar 4, 2, 5
    em sequência forma 0:04 -> 0:42 -> 4:25), em vez de só ser acrescentado
    no fim do texto. O valor inicial fica parado até a primeira tecla ser
    digitada; a partir daí só os dígitos realmente digitados contam."""

    MAX_DIGITS = 6

    def __init__(self, master, initial="0:00", **kwargs):
        super().__init__(master, **kwargs)
        self._placeholder = initial
        self._digits = ""
        self._render()
        self.bind("<Key>", self._on_key)
        self.bind("<<Paste>>", self._on_paste)

    def _format(self) -> str:
        if not self._digits:
            return self._placeholder
        seconds = self._digits[-2:].zfill(2)
        rest = self._digits[:-2]
        if not rest:
            return f"0:{seconds}"
        if len(rest) <= 2:
            return f"{int(rest)}:{seconds}"
        hours, minutes = rest[:-2], rest[-2:]
        return f"{int(hours)}:{minutes}:{seconds}"

    def _render(self):
        self.delete(0, "end")
        self.insert(0, self._format())
        self.icursor("end")

    def _on_key(self, event):
        if event.keysym in ("Tab", "ISO_Left_Tab"):
            return None
        if event.keysym == "BackSpace":
            self._digits = self._digits[:-1]
            self._render()
            return "break"
        if event.keysym in ("Delete", "Escape"):
            self._digits = ""
            self._render()
            return "break"
        if event.char.isdigit():
            self._digits = (self._digits + event.char)[-self.MAX_DIGITS:]
            self._render()
        return "break"

    def _on_paste(self, event):
        try:
            text = self.clipboard_get()
        except tk.TclError:
            return "break"
        digits = "".join(ch for ch in text if ch.isdigit())
        if digits:
            self._digits = (self._digits + digits)[-self.MAX_DIGITS:]
            self._render()
        return "break"


# ---------------------------------------------------------------------------
# Aplicativo
# ---------------------------------------------------------------------------

class DownloaderApp:
    CHECKED = "☑"
    UNCHECKED = "☐"

    def __init__(self, root):
        self.root = root
        root.title("Baixador de Clipes do YouTube")
        self._place_window(800, 940)
        root.minsize(720, 640)
        root.configure(bg=BG)
        root.columnconfigure(0, weight=1)
        root.rowconfigure(2, weight=1)

        self.ffmpeg_path = find_ffmpeg()

        # estado do link / lista
        self.view = "empty"  # empty | single | playlist
        self.fetching = False
        self.busy = False
        self.single_item: Item | None = None
        self.rows: dict[str, dict] = {}
        self.link_key: str | None = None
        self.fetch_gen = 0
        self.thumb_gen = 0
        self.run_gen = 0
        self.closing = False
        self._debounce_id = None
        self._q_index = 0
        self._q_total = 0
        self._last_error = ""
        self._done_titles: dict[str, str] = {}

        # comunicação threads -> Tk
        self.events: queue.Queue = queue.Queue()
        self.cancel_event = threading.Event()
        self.thumb_pool = ThreadPoolExecutor(max_workers=4)

        self.thumb_refs: dict[str, object] = {}
        self._lock_widgets: list = []

        self._setup_style(root)
        self.placeholder_row = self._make_placeholder(ROW_THUMB)
        self.placeholder_card = self._make_placeholder(CARD_THUMB)
        self.card_photo = None

        self._build_header()
        self._build_link_bar()
        self._build_preview_area()
        self._build_format_panel()
        self._build_single_options()
        self._build_folder_panel()
        self._build_action_bar()
        self._build_log()

        root.protocol("WM_DELETE_WINDOW", self._on_close)
        self._refresh_ui()
        self.root.after(100, self._poll_events)

        if self.ffmpeg_path:
            self._log(f"ffmpeg encontrado: {self.ffmpeg_path}")
        else:
            self._log(
                "AVISO: ffmpeg não encontrado. Instale com 'winget install ffmpeg' "
                "e depois FECHE e ABRA este app de novo (o Windows só atualiza o "
                "PATH em janelas/processos novos)."
            )
        if Image is None:
            self._log("Pillow não instalado: as miniaturas ficam desativadas "
                      "(instale com: pip install Pillow).")

    # --- construção da interface -------------------------------------------

    def _place_window(self, width: int, height: int):
        """Centraliza e limita ao tamanho da tela (senão a barra de tarefas
        cobre o rodapé da janela em telas menores)."""
        screen_w = self.root.winfo_screenwidth()
        screen_h = self.root.winfo_screenheight()
        width = min(width, screen_w - 40)
        height = min(height, screen_h - 110)
        x = max(0, (screen_w - width) // 2)
        y = max(0, (screen_h - height) // 2 - 20)
        self.root.geometry(f"{width}x{height}+{x}+{y}")

    def _make_placeholder(self, size):
        img = tk.PhotoImage(width=size[0], height=size[1])
        img.put(PLACEHOLDER, to=(0, 0, size[0], size[1]))
        return img

    def _build_header(self):
        header = tk.Frame(self.root, bg=BG)
        header.grid(row=0, column=0, sticky="ew", padx=16, pady=(16, 2))
        tk.Label(header, text="Baixador de Clipes do YouTube", bg=BG, fg=TEXT,
                 font=(FONT, 15, "bold")).pack(anchor="w")
        tk.Label(header, text="Cole o link de um vídeo ou playlist, escolha o que baixar e pronto.",
                 bg=BG, fg=TEXT_DIM, font=(FONT, 9)).pack(anchor="w")

    def _build_link_bar(self):
        bar = tk.Frame(self.root, bg=BG)
        bar.grid(row=1, column=0, sticky="ew", padx=16, pady=(10, 4))
        bar.columnconfigure(0, weight=1)

        self.url_var = tk.StringVar()
        self.url_entry = self._entry(bar, textvariable=self.url_var)
        self.url_entry.grid(row=0, column=0, sticky="ew")
        self.search_btn = self._button(bar, "Buscar", self._force_fetch, small=True)
        self.search_btn.grid(row=0, column=1, sticky="ns", padx=(8, 0))
        self.link_status = tk.Label(bar, text="", bg=BG, fg=TEXT_DIM, font=(FONT, 9), anchor="w")
        self.link_status.grid(row=1, column=0, columnspan=2, sticky="w", pady=(4, 0))

        self.url_var.trace_add("write", self._on_url_change)
        self.url_entry.bind("<Return>", lambda _e: self._force_fetch())
        self._lock_widgets += [self.url_entry, self.search_btn]

    def _build_preview_area(self):
        self.preview = tk.Frame(self.root, bg=BG)
        self.preview.grid(row=2, column=0, sticky="nsew", padx=16, pady=4)
        self.preview.columnconfigure(0, weight=1)
        self.preview.rowconfigure(0, weight=1)

        # vazio
        self.empty_frame = self._card(self.preview)
        tk.Label(self.empty_frame,
                 text="Cole um link de vídeo ou de playlist do YouTube para começar.\n"
                      "O app mostra o que é e deixa você escolher o que baixar.",
                 bg=PANEL_BG, fg=TEXT_DIM, font=(FONT, 10), justify="center").place(
            relx=0.5, rely=0.5, anchor="center")

        # vídeo único
        self.single_frame = self._card(self.preview)
        self.single_frame.columnconfigure(1, weight=1)
        self.card_thumb = tk.Label(self.single_frame, image=self.placeholder_card, bg=PANEL_BG)
        self.card_thumb.grid(row=0, column=0, rowspan=3, padx=14, pady=14, sticky="n")
        self.card_title = tk.Label(self.single_frame, text="", bg=PANEL_BG, fg=TEXT,
                                    font=(FONT, 12, "bold"), justify="left", anchor="w",
                                    wraplength=520)
        self.card_title.grid(row=0, column=1, sticky="w", padx=(0, 14), pady=(16, 2))
        self.card_meta = tk.Label(self.single_frame, text="", bg=PANEL_BG, fg=TEXT_DIM,
                                   font=(FONT, 9), anchor="w")
        self.card_meta.grid(row=1, column=1, sticky="w")
        self.single_status_var = tk.StringVar(value="")
        self.single_status = tk.Label(self.single_frame, textvariable=self.single_status_var,
                                       bg=PANEL_BG, fg=TEXT_DIM, font=(FONT, 9, "bold"), anchor="w")
        self.single_status.grid(row=2, column=1, sticky="w", pady=(6, 0))

        # playlist
        self.playlist_frame = self._card(self.preview)
        self.playlist_frame.columnconfigure(0, weight=1)
        self.playlist_frame.rowconfigure(2, weight=1)

        head = tk.Frame(self.playlist_frame, bg=PANEL_BG)
        head.grid(row=0, column=0, columnspan=2, sticky="ew", padx=12, pady=(10, 0))
        head.columnconfigure(0, weight=1)
        self.pl_title = tk.Label(head, text="", bg=PANEL_BG, fg=TEXT, font=(FONT, 11, "bold"),
                                  anchor="w")
        self.pl_title.grid(row=0, column=0, sticky="ew")
        self.pl_count = tk.Label(head, text="", bg=PANEL_BG, fg=TEXT_DIM, font=(FONT, 9))
        self.pl_count.grid(row=0, column=1, sticky="e")

        tools = tk.Frame(self.playlist_frame, bg=PANEL_BG)
        tools.grid(row=1, column=0, columnspan=2, sticky="ew", padx=12, pady=8)
        self.check_all_btn = self._button(tools, "Marcar todos", lambda: self._set_all_checked(True),
                                          small=True, secondary=True)
        self.check_all_btn.pack(side="left")
        self.uncheck_all_btn = self._button(tools, "Desmarcar todos",
                                            lambda: self._set_all_checked(False),
                                            small=True, secondary=True)
        self.uncheck_all_btn.pack(side="left", padx=(6, 0))
        self.sel_count = tk.Label(tools, text="", bg=PANEL_BG, fg=TEXT_DIM, font=(FONT, 9))
        self.sel_count.pack(side="right")
        tk.Label(tools, text="Clique numa linha para marcar · clique em Formato para trocar",
                 bg=PANEL_BG, fg=TEXT_DIM, font=(FONT, 8)).pack(side="right", padx=(0, 14))

        self.tree = ttk.Treeview(
            self.playlist_frame, style="Queue.Treeview",
            columns=("check", "title", "duration", "format", "status"),
            show="tree headings", selectmode="browse")
        self.tree.heading("#0", text="")
        self.tree.heading("check", text="")
        self.tree.heading("title", text="Vídeo", anchor="w")
        self.tree.heading("duration", text="Duração")
        self.tree.heading("format", text="Formato")
        self.tree.heading("status", text="Status", anchor="w")
        self.tree.column("#0", width=100, stretch=False, anchor="center")
        self.tree.column("check", width=40, stretch=False, anchor="center")
        self.tree.column("title", width=280, anchor="w")
        self.tree.column("duration", width=70, stretch=False, anchor="center")
        self.tree.column("format", width=120, stretch=False, anchor="center")
        self.tree.column("status", width=110, stretch=False, anchor="w")
        self.tree.tag_configure("unavailable", foreground="#9ca3af")
        self.tree.tag_configure("link", background=LINK_ROW_BG)
        self.tree.tag_configure("done", foreground=OK_FG)
        self.tree.tag_configure("error", foreground=ERROR_FG)
        self.tree.tag_configure("cancelled", foreground="#9ca3af")
        self.tree.grid(row=2, column=0, sticky="nsew", padx=(12, 0))
        scroll = ttk.Scrollbar(self.playlist_frame, orient="vertical", command=self.tree.yview,
                               style="App.Vertical.TScrollbar")
        scroll.grid(row=2, column=1, sticky="ns", padx=(0, 12))
        self.tree.configure(yscrollcommand=scroll.set)

        self.tree.bind("<Button-1>", self._on_tree_click)
        self.tree.bind("<space>", self._on_tree_space)
        self.tree.bind("<Control-a>", lambda _e: (self._set_all_checked(True), "break")[1])
        self.tree.bind("<<TreeviewSelect>>", self._on_row_select)

        self.detail_var = tk.StringVar(value="")
        self.detail_label = tk.Label(self.playlist_frame, textvariable=self.detail_var,
                                      bg=PANEL_BG, fg=TEXT, font=(FONT, 9), justify="left",
                                      anchor="w", wraplength=700)
        self.detail_label.grid(row=3, column=0, columnspan=2, sticky="ew", padx=12, pady=(8, 10))
        self.playlist_frame.bind(
            "<Configure>", lambda e: self.detail_label.config(wraplength=max(200, e.width - 30)))

    def _build_format_panel(self):
        panel = self._panel(self.root, "Formato")
        panel.grid(row=3, column=0, sticky="ew", padx=16, pady=4)

        self.mode_var = tk.StringVar(value="video")
        radios = tk.Frame(panel, bg=PANEL_BG)
        radios.grid(row=0, column=0, columnspan=4, sticky="w", padx=6, pady=(4, 0))
        for text, value in (("Vídeo (com áudio)", "video"),
                            ("Vídeo (sem áudio)", "video_noaudio"),
                            ("Só áudio", "audio")):
            radio = self._radio(radios, text, value, self.mode_var, self._on_mode_change)
            radio.pack(side="left", padx=8, pady=2)
            self._lock_widgets.append(radio)

        self.res_label = tk.Label(panel, text="Resolução:", bg=PANEL_BG, fg=TEXT, font=(FONT, 9))
        self.res_label.grid(row=1, column=0, sticky="w", padx=(14, 6), pady=6)
        self.res_var = tk.StringVar(value="Melhor disponível")
        self.res_combo = ttk.Combobox(panel, textvariable=self.res_var,
                                       values=list(RESOLUTIONS.keys()), state="readonly",
                                       width=18, style="App.TCombobox")
        self.res_combo.grid(row=1, column=1, sticky="w", pady=6)

        self.audio_fmt_label = tk.Label(panel, text="Formato de áudio:", bg=PANEL_BG, fg=TEXT,
                                         font=(FONT, 9))
        self.audio_fmt_label.grid(row=1, column=2, sticky="w", padx=(20, 6), pady=6)
        self.audio_fmt_var = tk.StringVar(value="mp3")
        self.audio_fmt_combo = ttk.Combobox(panel, textvariable=self.audio_fmt_var,
                                             values=AUDIO_FORMATS, state="readonly",
                                             width=10, style="App.TCombobox")
        self.audio_fmt_combo.grid(row=1, column=3, sticky="w", pady=6)
        self._lock_widgets += [self.res_combo, self.audio_fmt_combo]

    def _build_single_options(self):
        """Corte de trecho e nome do arquivo: só fazem sentido para 1 vídeo."""
        self.single_opts = tk.Frame(self.root, bg=BG)
        self.single_opts.grid(row=4, column=0, sticky="ew", padx=16, pady=4)
        self.single_opts.columnconfigure(1, weight=1)

        clip_frame = self._panel(self.single_opts, "Cortar um trecho (opcional)")
        clip_frame.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        self.clip_var = tk.BooleanVar(value=False)
        clip_check = self._check(clip_frame, "Baixar só um trecho", self.clip_var,
                                 self._update_fields)
        clip_check.grid(row=0, column=0, columnspan=4, sticky="w", padx=6, pady=(4, 0))
        tk.Label(clip_frame, text="Início:", bg=PANEL_BG, fg=TEXT,
                 font=(FONT, 9)).grid(row=1, column=0, sticky="e", padx=(10, 2))
        self.start_entry = TimeMaskEntry(clip_frame, initial="0:00", width=8, **self._entry_kwargs())
        self.start_entry.grid(row=1, column=1, sticky="w", pady=4)
        tk.Label(clip_frame, text="Fim:", bg=PANEL_BG, fg=TEXT,
                 font=(FONT, 9)).grid(row=1, column=2, sticky="e", padx=(10, 2))
        self.end_entry = TimeMaskEntry(clip_frame, initial="0:30", width=8, **self._entry_kwargs())
        self.end_entry.grid(row=1, column=3, sticky="w", pady=4, padx=(0, 10))
        tk.Label(clip_frame, text="Digite só os números (MM:SS ou HH:MM:SS).",
                 bg=PANEL_BG, fg=TEXT_DIM, font=(FONT, 8)).grid(
            row=2, column=0, columnspan=4, sticky="w", padx=10, pady=(0, 4))

        name_frame = self._panel(self.single_opts, "Nome do arquivo (opcional)")
        name_frame.grid(row=0, column=1, sticky="nsew")
        name_frame.columnconfigure(0, weight=1)
        self.filename_var = tk.StringVar(value="")
        self.filename_entry = self._entry(name_frame, textvariable=self.filename_var)
        self.filename_entry.grid(row=0, column=0, sticky="ew", padx=10, pady=(10, 0))
        tk.Label(name_frame, text="Em branco = usa o título do vídeo", bg=PANEL_BG,
                 fg=TEXT_DIM, font=(FONT, 8)).grid(row=1, column=0, sticky="w", padx=10, pady=(2, 6))
        self._lock_widgets += [clip_check, self.filename_entry]

    def _build_folder_panel(self):
        panel = self._panel(self.root, "Pasta de destino")
        panel.grid(row=5, column=0, sticky="ew", padx=16, pady=4)
        panel.columnconfigure(0, weight=1)
        self.output_dir_var = tk.StringVar(value=load_last_output_dir())
        self.folder_entry = self._entry(panel, textvariable=self.output_dir_var)
        self.folder_entry.grid(row=0, column=0, sticky="ew", padx=(10, 8), pady=8)
        self.folder_btn = self._button(panel, "Escolher...", self._choose_folder, small=True,
                                       secondary=True)
        self.folder_btn.grid(row=0, column=1, padx=(0, 10))
        self._lock_widgets += [self.folder_entry, self.folder_btn]

    def _build_action_bar(self):
        bar = tk.Frame(self.root, bg=BG)
        bar.grid(row=6, column=0, sticky="ew", padx=16, pady=(8, 2))
        bar.columnconfigure(0, weight=1)
        self.download_btn = self._button(bar, "Baixar", self._start_download)
        self.download_btn.grid(row=0, column=0, sticky="ew")
        self.cancel_btn = self._button(bar, "Cancelar", self._cancel_download, small=True,
                                       secondary=True)
        self.cancel_btn.grid(row=0, column=1, sticky="ns", padx=(8, 0))

        prog = tk.Frame(self.root, bg=BG)
        prog.grid(row=7, column=0, sticky="ew", padx=16, pady=(6, 0))
        prog.columnconfigure(0, weight=1)
        self.progress_text = tk.StringVar(value="")
        tk.Label(prog, textvariable=self.progress_text, bg=BG, fg=TEXT_DIM, font=(FONT, 9),
                 anchor="w").grid(row=0, column=0, sticky="ew")
        self.progress = ttk.Progressbar(prog, mode="determinate",
                                        style="App.Horizontal.TProgressbar")
        self.progress.grid(row=1, column=0, sticky="ew", pady=(2, 0))

    def _build_log(self):
        self.log_text = tk.Text(self.root, height=5, state="disabled", wrap="word",
                                 bg=FIELD_BG, fg=LOG_FG, insertbackground=LOG_FG,
                                 font=(FONT, 9), bd=0, highlightthickness=1,
                                 highlightbackground=BORDER)
        self.log_text.grid(row=8, column=0, sticky="ew", padx=16, pady=(8, 16))

    # --- helpers de estilo ------------------------------------------------

    def _setup_style(self, root):
        style = ttk.Style(root)
        style.theme_use("clam")

        style.configure("App.TCombobox",
                         fieldbackground=FIELD_BG, background=FIELD_BG, foreground=TEXT,
                         arrowcolor=TEXT_DIM, bordercolor=BORDER, lightcolor=BORDER,
                         darkcolor=BORDER, insertcolor=TEXT,
                         selectbackground=FIELD_BG, selectforeground=TEXT)
        style.map("App.TCombobox",
                  fieldbackground=[("readonly", FIELD_BG), ("disabled", BG)],
                  foreground=[("readonly", TEXT), ("disabled", TEXT_DIM)],
                  background=[("readonly", FIELD_BG)],
                  selectbackground=[("readonly", FIELD_BG), ("focus", FIELD_BG)],
                  selectforeground=[("readonly", TEXT), ("focus", TEXT)])

        style.configure("App.Horizontal.TProgressbar",
                         troughcolor=BORDER, background=ACCENT,
                         bordercolor=BORDER, lightcolor=ACCENT, darkcolor=ACCENT,
                         thickness=8)

        style.configure("Queue.Treeview",
                         background=PANEL_BG, fieldbackground=PANEL_BG, foreground=TEXT,
                         rowheight=52, borderwidth=0, font=(FONT, 9))
        style.configure("Queue.Treeview.Heading",
                         background=BG, foreground=TEXT_DIM, relief="flat",
                         font=(FONT, 9, "bold"))
        style.map("Queue.Treeview",
                  background=[("selected", SELECT_BG)],
                  foreground=[("selected", TEXT)])
        style.map("Queue.Treeview.Heading", background=[("active", BG)])

        style.configure("App.Vertical.TScrollbar", background=BORDER, troughcolor=BG,
                         bordercolor=BG, arrowcolor=TEXT_DIM, relief="flat")

        root.option_add("*TCombobox*Listbox.background", FIELD_BG)
        root.option_add("*TCombobox*Listbox.foreground", TEXT)
        root.option_add("*TCombobox*Listbox.selectBackground", ACCENT)
        root.option_add("*TCombobox*Listbox.selectForeground", "#ffffff")

    def _card(self, parent):
        return tk.Frame(parent, bg=PANEL_BG, highlightthickness=1, highlightbackground=BORDER)

    def _panel(self, parent, text):
        return tk.LabelFrame(parent, text=text, bg=PANEL_BG, fg=TEXT_DIM,
                              font=(FONT, 9, "bold"), bd=0,
                              highlightthickness=1, highlightbackground=BORDER,
                              labelanchor="nw")

    def _entry_kwargs(self):
        return dict(bg=FIELD_BG, fg=TEXT, insertbackground=TEXT, relief="flat",
                    bd=8, highlightthickness=1, highlightbackground=BORDER,
                    highlightcolor=ACCENT, font=(FONT, 10),
                    disabledbackground=BG, disabledforeground=TEXT_DIM)

    def _entry(self, parent, **kwargs):
        return tk.Entry(parent, **self._entry_kwargs(), **kwargs)

    def _radio(self, parent, text, value, variable, command):
        return tk.Radiobutton(parent, text=text, value=value, variable=variable,
                               command=command, bg=PANEL_BG, fg=TEXT,
                               selectcolor=FIELD_BG, activebackground=PANEL_BG,
                               activeforeground=TEXT, disabledforeground=TEXT_DIM,
                               font=(FONT, 9), highlightthickness=0, bd=0)

    def _check(self, parent, text, variable, command):
        return tk.Checkbutton(parent, text=text, variable=variable, command=command,
                               bg=PANEL_BG, fg=TEXT, selectcolor=FIELD_BG,
                               activebackground=PANEL_BG, activeforeground=TEXT,
                               disabledforeground=TEXT_DIM, font=(FONT, 9),
                               highlightthickness=0, bd=0)

    def _button(self, parent, text, command, small=False, secondary=False):
        base = SECONDARY_BG if secondary else ACCENT
        hover = SECONDARY_HOVER if secondary else ACCENT_HOVER
        fg = TEXT if secondary else "#ffffff"
        btn = tk.Button(parent, text=text, command=command, bg=base, fg=fg,
                         activebackground=hover, activeforeground=fg,
                         disabledforeground="#9ca3af",
                         font=(FONT, 9 if small else 11, "normal" if small else "bold"),
                         bd=0, relief="flat", highlightthickness=0, cursor="hand2",
                         padx=14 if small else 0, pady=4 if small else 9)
        btn.base_bg = base
        btn.hover_bg = hover
        btn.bind("<Enter>", lambda _e: btn["state"] != "disabled" and btn.config(bg=btn.hover_bg))
        btn.bind("<Leave>", lambda _e: btn.config(
            bg=btn.base_bg if btn["state"] != "disabled" else DISABLED_BG))
        return btn

    def _enable(self, btn, on: bool):
        btn.config(state="normal" if on else "disabled", bg=btn.base_bg if on else DISABLED_BG)

    # --- estado da interface ----------------------------------------------

    def _selected_count(self) -> int:
        return sum(1 for row in self.rows.values() if row["checked"] and row["item"].available)

    def _refresh_ui(self):
        """Único lugar que decide o que aparece e o que fica habilitado."""
        view, busy, fetching = self.view, self.busy, self.fetching

        frames = {"empty": self.empty_frame, "single": self.single_frame,
                  "playlist": self.playlist_frame}
        for name, frame in frames.items():
            if name == view:
                frame.grid(row=0, column=0, sticky="nsew")
            else:
                frame.grid_remove()

        if view == "playlist":
            self.single_opts.grid_remove()
        else:
            self.single_opts.grid()

        self._update_fields()
        self._set_locked(busy)

        n = self._selected_count()
        if busy:
            text, ready = "Baixando…", False
        elif view == "single":
            item = self.single_item
            text, ready = "Baixar", bool(item and item.available and not fetching)
        elif view == "playlist":
            text = f"Baixar {n} vídeo{'s' if n != 1 else ''}" if n else "Baixar"
            ready = n > 0 and not fetching
        else:
            text, ready = "Baixar", False
        self.download_btn.config(text=text)
        self._enable(self.download_btn, ready)
        self._enable(self.cancel_btn, busy)

        tools_on = view == "playlist" and not busy and not fetching
        self._enable(self.check_all_btn, tools_on)
        self._enable(self.uncheck_all_btn, tools_on)
        if view == "playlist":
            total = len(self.rows)
            self.sel_count.config(text=f"{n} de {total} selecionado{'s' if n != 1 else ''}")

    def _update_fields(self):
        playlist = self.view == "playlist"
        mode = self.mode_var.get()
        show_res = playlist or mode in ("video", "video_noaudio")
        show_audio = playlist or mode == "audio"
        for widget, show in ((self.res_label, show_res), (self.res_combo, show_res),
                             (self.audio_fmt_label, show_audio), (self.audio_fmt_combo, show_audio)):
            if show:
                widget.grid()
            else:
                widget.grid_remove()

        clip_on = self.clip_var.get() and not self.busy
        state = "normal" if clip_on else "disabled"
        self.start_entry.config(state=state)
        self.end_entry.config(state=state)

    def _set_locked(self, locked: bool):
        for widget in self._lock_widgets:
            if isinstance(widget, ttk.Combobox):
                widget.config(state="disabled" if locked else "readonly")
            elif isinstance(widget, tk.Button):
                self._enable(widget, not locked)
            else:
                widget.config(state="disabled" if locked else "normal")

    def _set_link_status(self, text: str, error: bool = False):
        self.link_status.config(text=text, fg=ERROR_FG if error else TEXT_DIM)

    # --- busca do link -----------------------------------------------------

    def _on_url_change(self, *_args):
        if self._debounce_id:
            self.root.after_cancel(self._debounce_id)
        self._debounce_id = self.root.after(600, self._start_fetch_from_entry)

    def _force_fetch(self):
        if self._debounce_id:
            self.root.after_cancel(self._debounce_id)
            self._debounce_id = None
        self._start_fetch_from_entry(force=True)

    def _start_fetch_from_entry(self, force: bool = False):
        self._debounce_id = None
        if self.busy:
            return
        raw = self.url_var.get().strip()
        if not raw:
            self._reset_link()
            return
        info = parse_youtube_url(raw)
        if info.kind in ("channel", "invalid"):
            self._reset_link()
            self._set_link_status(info.reason or "Cole o link de um vídeo ou playlist do YouTube.",
                                  error=True)
            return
        if not force and canonical_target(info) == self.link_key:
            return
        self._start_fetch(info)

    def _reset_link(self):
        self.fetch_gen += 1
        self.thumb_gen += 1
        self.fetching = False
        self.link_key = None
        self.view = "empty"
        self.single_item = None
        self._clear_rows()
        self._set_link_status("")
        self._refresh_ui()

    def _clear_rows(self):
        if hasattr(self, "tree"):
            self.tree.delete(*self.tree.get_children())
        self.rows.clear()
        self.thumb_refs.clear()
        self.detail_var.set("")

    def _start_fetch(self, info: UrlInfo):
        self.fetch_gen += 1
        self.thumb_gen += 1
        gen = self.fetch_gen
        self.fetching = True
        self.link_key = canonical_target(info)
        self.single_item = None
        self._clear_rows()
        self.progress_text.set("")
        self.progress["value"] = 0
        self.single_status_var.set("")

        if info.kind == "video":
            self.view = "single"
            self.card_thumb.config(image=self.placeholder_card)
            self.card_title.config(text="Carregando…")
            self.card_meta.config(text="")
            self.thumb_pool.submit(self._thumb_task, self.thumb_gen, "card", info.video_id, CARD_THUMB)
        else:
            self.view = "playlist"
            self.pl_title.config(text="Carregando playlist…")
            self.pl_count.config(text="")
        self._set_link_status("Buscando informações no YouTube…")
        self._refresh_ui()
        threading.Thread(target=self._fetch_worker, args=(gen, info), daemon=True).start()

    def _fetch_worker(self, gen: int, info: UrlInfo):
        try:
            data = fetch_url_info(info)
        except Exception as exc:  # noqa: BLE001 - vira mensagem inline
            self.events.put(("fetch_err", gen, friendly_fetch_error(exc)))
            return
        self.events.put(("fetch_ok", gen, (info, data)))

    def _show_single_result(self, item: Item, note: str = ""):
        self.single_item = item
        self.card_title.config(text=item.title)
        meta = " · ".join(x for x in (item.channel, format_duration(item.duration)) if x)
        self.card_meta.config(text=meta)
        self.fetching = False
        if not item.available:
            self._set_link_status(f"{item.reason}: esse vídeo não pode ser baixado.", error=True)
        else:
            self._set_link_status(note)
        self._refresh_ui()

    def _on_fetch_ok(self, info: UrlInfo, data: dict):
        if info.kind == "video":
            item = normalize_item(data) if data else None
            if item is None:
                self._on_fetch_err("Não consegui identificar esse vídeo.")
                return
            self._show_single_result(item)
            return

        title, items = normalize_entries(data)
        if not items and data and not data.get("entries"):
            # O YouTube não tem essa lista (ex.: mix que ele não gerou) e devolveu
            # só o vídeo do link: mostra como vídeo único em vez de "playlist vazia".
            item = normalize_item(data)
            if item is not None:
                self.view = "single"
                self.card_thumb.config(image=self.placeholder_card)
                self.thumb_pool.submit(self._thumb_task, self.thumb_gen, "card", item.id, CARD_THUMB)
                self._show_single_result(
                    item, "Essa playlist não está disponível; mostrando só o vídeo do link.")
                return
        if not items:
            self._on_fetch_err("Não encontrei vídeos nessa playlist (ou o link não é de uma lista de vídeos).")
            return
        self.pl_title.config(text=title)
        self.pl_count.config(text=f"{len(items)} vídeo{'s' if len(items) != 1 else ''}")
        self._set_link_status(f"Playlist carregada: {len(items)} vídeo{'s' if len(items) != 1 else ''}.")
        self._insert_rows(self.fetch_gen, items, 0, info.video_id)

    def _on_fetch_err(self, message: str):
        self.fetching = False
        self.link_key = None
        self.view = "empty"
        self.single_item = None
        self._clear_rows()
        self._set_link_status(message, error=True)
        self._refresh_ui()

    def _insert_rows(self, gen: int, items: list, start: int, highlight_id: str | None):
        """Insere as linhas em blocos, pra playlists grandes não travarem a janela."""
        if gen != self.fetch_gen:
            return
        end = min(start + 100, len(items))
        mode = self.mode_var.get()
        for i in range(start, end):
            item = items[i]
            iid = str(i)
            row = {"item": item, "checked": item.available, "mode": mode,
                   "status": "" if item.available else item.reason}
            self.rows[iid] = row
            tags = () if item.available else ("unavailable",)
            self.tree.insert("", "end", iid=iid, image=self.placeholder_row,
                             values=self._row_values(row), tags=tags)
            if item.available:
                self.thumb_pool.submit(self._thumb_task, self.thumb_gen, iid, item.id, ROW_THUMB)
        if end < len(items):
            self.root.after(10, self._insert_rows, gen, items, end, highlight_id)
            return

        self.fetching = False
        target = None
        if highlight_id:
            for iid, row in self.rows.items():
                if row["item"].id == highlight_id:
                    target = iid
                    break
        if target is None and self.rows:
            target = next(iter(self.rows))
        if target is not None:
            if highlight_id and self.rows[target]["item"].id == highlight_id:
                self.tree.item(target, tags=tuple(self.tree.item(target, "tags") or ()) + ("link",))
                self.rows[target]["status"] = "do link"
                self.tree.set(target, "status", "do link")
            self.tree.selection_set(target)
            self.tree.see(target)
        self._refresh_ui()

    # --- miniaturas --------------------------------------------------------

    def _thumb_task(self, gen: int, key: str, video_id: str, size: tuple):
        """Roda no pool: baixa e decodifica; a PhotoImage é criada no Tk."""
        if Image is None or gen != self.thumb_gen or self.closing:
            return
        data = fetch_thumbnail(video_id)
        if not data or gen != self.thumb_gen or self.closing:
            return
        image = decode_thumbnail(data, size)
        if image is not None:
            self.events.put(("thumb", gen, (key, image)))

    def _on_thumb(self, key: str, image):
        photo = ImageTk.PhotoImage(image)
        if key == "card":
            self.card_photo = photo
            self.card_thumb.config(image=photo)
        elif key in self.rows:
            self.thumb_refs[key] = photo
            self.tree.item(key, image=photo)

    # --- interação com a lista --------------------------------------------

    def _row_values(self, row: dict):
        item = row["item"]
        check = self.CHECKED if row["checked"] and item.available else (
            self.UNCHECKED if item.available else "")
        fmt = f"{MODE_LABELS[row['mode']]} ▾" if item.available else ""
        return (check, item.title, format_duration(item.duration), fmt, row["status"])

    def _column_at(self, iid: str, x: int) -> str:
        """Coluna sob o clique, pela geometria desenhada (bbox). O
        identify_column do Tk no tema 'clam' fica ~5 px deslocado e mandaria
        cliques na borda esquerda de uma coluna para a coluna anterior."""
        for column in ("#0", "#1", "#2", "#3", "#4", "#5"):
            box = self.tree.bbox(iid, column)
            if box and box[0] <= x < box[0] + box[2]:
                return column
        return self.tree.identify_column(x)

    def _on_tree_click(self, event):
        iid = self.tree.identify_row(event.y)
        if not iid or iid not in self.rows:
            return None
        column = self._column_at(iid, event.x)  # #0 miniatura, #1 ✓, ... #4 formato
        self.tree.selection_set(iid)
        self.tree.focus(iid)
        if self.busy:
            return "break"
        if column == "#4":
            self._popup_format_menu(iid, event)
        else:
            self._toggle_row(iid)
        return "break"

    def _on_tree_space(self, _event):
        iid = self.tree.focus()
        if iid and not self.busy:
            self._toggle_row(iid)
        return "break"

    def _popup_format_menu(self, iid: str, event):
        if not self.rows[iid]["item"].available:
            return
        menu = tk.Menu(self.root, tearoff=0, bg=PANEL_BG, fg=TEXT, activebackground=ACCENT,
                       activeforeground="#ffffff", font=(FONT, 9), bd=0)
        for mode, label in MODE_LABELS.items():
            menu.add_command(label=label, command=lambda m=mode: self._set_row_mode(iid, m))
        try:
            menu.tk_popup(event.x_root, event.y_root)
        finally:
            menu.grab_release()

    def _refresh_row(self, iid: str):
        row = self.rows[iid]
        values = self._row_values(row)
        for column, value in zip(("check", "title", "duration", "format", "status"), values):
            self.tree.set(iid, column, value)

    def _toggle_row(self, iid: str):
        row = self.rows[iid]
        if not row["item"].available:
            return
        row["checked"] = not row["checked"]
        self._refresh_row(iid)
        self._refresh_ui()

    def _set_all_checked(self, checked: bool):
        if self.busy:
            return
        for iid, row in self.rows.items():
            if row["item"].available:
                row["checked"] = checked
                self._refresh_row(iid)
        self._refresh_ui()

    def _set_row_mode(self, iid: str, mode: str):
        self.rows[iid]["mode"] = mode
        self._refresh_row(iid)
        self._on_row_select()

    def _apply_mode_to_all(self, mode: str):
        for iid, row in self.rows.items():
            if row["item"].available:
                row["mode"] = mode
                self._refresh_row(iid)
        self._on_row_select()

    def _on_mode_change(self):
        if self.view == "playlist" and not self.busy:
            self._apply_mode_to_all(self.mode_var.get())
        self._update_fields()

    def _on_row_select(self, _event=None):
        selection = self.tree.selection()
        if not selection or selection[0] not in self.rows:
            return
        row = self.rows[selection[0]]
        item = row["item"]
        extra = MODE_LABELS[row["mode"]] if item.available else item.reason
        meta = " · ".join(x for x in (item.channel, format_duration(item.duration), extra) if x)
        self.detail_var.set(f"{item.title}\n{meta}")

    # --- pasta / log -------------------------------------------------------

    def _choose_folder(self):
        folder = filedialog.askdirectory()
        if folder:
            self.output_dir_var.set(folder)
            save_last_output_dir(folder)

    def _log(self, message: str):
        self.log_text.config(state="normal")
        self.log_text.insert("end", message + "\n")
        self.log_text.see("end")
        self.log_text.config(state="disabled")

    # --- download (fila) ---------------------------------------------------

    def _start_download(self):
        if self.busy or self.fetching:
            return

        if not self.ffmpeg_path:
            messagebox.showerror(
                "ffmpeg não encontrado",
                "O ffmpeg não foi encontrado neste computador.\n\n"
                "1. Instale com: winget install ffmpeg\n"
                "2. Feche este app e abra de novo (uma janela/processo já "
                "aberto não enxerga o PATH atualizado pelo instalador).\n\n"
                "Veja o README.md para instruções detalhadas.",
            )
            return

        single = self.view == "single"
        items: list[QueueItem] = []
        if single and self.single_item and self.single_item.available:
            it = self.single_item
            items.append(QueueItem("single", it.id, it.url, it.title, self.mode_var.get()))
        elif self.view == "playlist":
            for iid, row in self.rows.items():
                if row["checked"] and row["item"].available:
                    it = row["item"]
                    items.append(QueueItem(iid, it.id, it.url, it.title, row["mode"]))
        if not items:
            messagebox.showerror("Nada selecionado", "Escolha pelo menos um vídeo para baixar.")
            return
        if len(items) > BIG_QUEUE and not messagebox.askyesno(
                "Baixar muitos vídeos",
                f"Você marcou {len(items)} vídeos. Baixar tudo pode demorar bastante e "
                "ocupar muito espaço no disco.\n\nContinuar?"):
            return

        start_s = end_s = None
        if single and self.clip_var.get():
            try:
                start_s = parse_time(self.start_entry.get()) or 0
                end_s = parse_time(self.end_entry.get())
                if end_s is None or end_s <= start_s:
                    raise ValueError("O tempo final deve ser maior que o inicial.")
            except ValueError as exc:
                messagebox.showerror("Erro", str(exc))
                return

        output_dir = self.output_dir_var.get().strip() or DEFAULT_OUTPUT_DIR
        os.makedirs(output_dir, exist_ok=True)
        save_last_output_dir(output_dir)

        # Snapshot de tudo que vem do Tk, aqui na thread principal: a thread
        # de download só enxerga este job.
        job = DownloadJob(
            ffmpeg=self.ffmpeg_path,
            out_dir=output_dir,
            height=RESOLUTIONS[self.res_var.get()],
            audio_fmt=self.audio_fmt_var.get(),
            start_s=start_s,
            end_s=end_s,
            custom_name=self.filename_var.get().strip() if single else "",
            items=items,
        )

        for queued in items:
            if queued.iid != "single":
                self.rows[queued.iid]["status"] = "Aguardando"
                self._refresh_row(queued.iid)
        self.single_status_var.set("Aguardando" if single else "")
        self.progress["value"] = 0
        self.progress_text.set("")
        self._last_error = ""
        self.cancel_event.clear()
        self.run_gen += 1
        self.busy = True
        self._refresh_ui()
        self._log(f"Iniciando fila: {len(items)} item{'ns' if len(items) != 1 else ''} em {output_dir}")

        gen = self.run_gen
        threading.Thread(
            target=run_download_queue,
            args=(job, lambda kind, payload: self.events.put((kind, gen, payload)), self.cancel_event),
            daemon=True,
        ).start()

    def _cancel_download(self):
        if self.busy and not self.cancel_event.is_set():
            self.cancel_event.set()
            self._enable(self.cancel_btn, False)
            self.progress_text.set("Cancelando…")
            self._log("Cancelando… (um corte de trecho só é interrompido ao terminar o atual)")

    def _set_item_status(self, iid: str, text: str, tag: str | None = None):
        if iid == "single":
            self.single_status_var.set(text)
            return
        if iid not in self.rows:
            return
        self.rows[iid]["status"] = text
        self.tree.set(iid, "status", text)
        if tag:
            self.tree.item(iid, tags=tuple(t for t in self.tree.item(iid, "tags")
                                           if t not in ("done", "error", "cancelled")) + (tag,))

    def _stop_indeterminate(self):
        if str(self.progress["mode"]) == "indeterminate":
            self.progress.stop()
            self.progress.config(mode="determinate")

    def _on_queue_start(self, index: int, total: int, iid: str, title: str):
        self._q_index, self._q_total = index, total
        self._stop_indeterminate()
        self.progress["value"] = index / total * 100
        self.progress_text.set(f"Baixando {index + 1} de {total} · {title}")
        self._set_item_status(iid, "Baixando 0%")
        self._done_titles[iid] = title
        if iid in self.rows:
            self.tree.see(iid)
            self.tree.selection_set(iid)

    def _on_queue_progress(self, iid: str, fraction: float):
        self._set_item_status(iid, f"Baixando {int(fraction * 100)}%")
        if self._q_total:
            self.progress["value"] = (self._q_index + fraction) / self._q_total * 100

    def _on_queue_item(self, iid: str, key: str, text: str, detail: str):
        self._stop_indeterminate()
        tag = {"done": "done", "exists": "done", "error": "error", "cancelled": "cancelled"}.get(key)
        self._set_item_status(iid, text, tag)
        title = self._done_titles.get(iid, "")
        if key == "error":
            self._last_error = detail
            self._log(f"Erro em '{title}': {detail}")
        elif key == "done":
            self._log(f"Concluído: {title}")
        elif key == "exists":
            self._log(f"Já existia (pulado): {title}")

    def _on_queue_done(self, counts: dict):
        self._stop_indeterminate()
        self.busy = False
        cancelled = self.cancel_event.is_set()
        if not cancelled:
            self.progress["value"] = 100
        summary = summarize_counts(counts)
        self.progress_text.set(("Cancelado — " if cancelled else "Fila concluída — ") + summary)
        self._log(("Cancelado: " if cancelled else "Concluído: ") + summary)
        self._refresh_ui()

        out_dir = self.output_dir_var.get().strip() or DEFAULT_OUTPUT_DIR
        if cancelled:
            return
        if self.view == "single":
            if counts["error"]:
                messagebox.showerror("Erro no download", self._last_error or "O download falhou.")
            else:
                messagebox.showinfo("Pronto", f"Download concluído!\nSalvo em:\n{out_dir}")
        else:
            messagebox.showinfo("Pronto", f"Fila concluída: {summary}.\nSalvo em:\n{out_dir}")

    # --- eventos das threads ----------------------------------------------

    def _poll_events(self):
        try:
            for _ in range(60):
                try:
                    kind, gen, payload = self.events.get_nowait()
                except queue.Empty:
                    break
                try:
                    self._handle_event(kind, gen, payload)
                except Exception as exc:  # noqa: BLE001 - um evento ruim não derruba o app
                    self._log(f"Erro interno ({kind}): {exc}")
        finally:
            if not self.closing:
                self.root.after(100, self._poll_events)

    def _handle_event(self, kind: str, gen: int, payload):
        if kind == "fetch_ok":
            if gen == self.fetch_gen:
                self._on_fetch_ok(*payload)
        elif kind == "fetch_err":
            if gen == self.fetch_gen:
                self._on_fetch_err(payload)
        elif kind == "thumb":
            if gen == self.thumb_gen:
                self._on_thumb(*payload)
        elif gen != self.run_gen:
            return
        elif kind == "start":
            self._on_queue_start(*payload)
        elif kind == "progress":
            self._on_queue_progress(*payload)
        elif kind == "indeterminate":
            self.progress.config(mode="indeterminate")
            self.progress.start(12)
            self._set_item_status(payload[0], "Cortando…")
        elif kind == "converting":
            self._set_item_status(payload[0], "Convertendo…")
        elif kind == "item":
            self._on_queue_item(*payload)
        elif kind == "done":
            self._on_queue_done(payload)

    def _on_close(self):
        if self.busy and not messagebox.askyesno(
                "Fechar", "Há downloads em andamento. Cancelar e fechar o app?"):
            return
        self.closing = True
        self.cancel_event.set()
        self.thumb_pool.shutdown(wait=False, cancel_futures=True)
        self.root.destroy()


if __name__ == "__main__":
    root = tk.Tk()
    DownloaderApp(root)
    root.mainloop()
