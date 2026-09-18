"""
Baixador de Clipes do YouTube
=============================

App simples com janela (Tkinter) para baixar vídeo (com áudio) ou só áudio
do YouTube, com opção de cortar um trecho específico (início/fim), e para
comprimir arquivos de vídeo sem perda visível de qualidade. Usa yt-dlp +
ffmpeg.

Como rodar:
    pip install -r requirements.txt
    python app.py

Requer o ffmpeg instalado e disponível no PATH do Windows
(veja instruções no README.md).
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

from yt_dlp import YoutubeDL
from yt_dlp.postprocessor.ffmpeg import FFmpegPostProcessor
from yt_dlp.utils import download_range_func

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

# CRF = qualidade constante. 18 é o ponto em que o olho não distingue do
# original ("visualmente sem perdas"); quanto maior, menor o arquivo.
COMPRESSION_LEVELS = {
    "Sem perda visível": {"crf": 18, "preset": "slow"},
    "Alta qualidade (recomendado)": {"crf": 20, "preset": "medium"},
    "Equilibrado (arquivo bem menor)": {"crf": 23, "preset": "medium"},
}

VIDEO_CODECS = {
    "H.264 (compatível com tudo)": "libx264",
    "H.265 (arquivo menor, mais lento)": "libx265",
}

# Áudio já comprimido é copiado sem recodificar (zero perda). Outros
# formatos viram AAC, pois o container .mp4 não aceita qualquer codec.
MP4_SAFE_AUDIO = {"aac", "mp3", "ac3", "eac3"}

# Chaves que o "ffmpeg -progress pipe:1" imprime; o que não for uma delas
# é mensagem do ffmpeg e serve para explicar uma eventual falha.
FFMPEG_PROGRESS_KEYS = {
    "frame", "fps", "bitrate", "total_size", "out_time", "out_time_ms",
    "out_time_us", "dup_frames", "drop_frames", "speed", "progress",
}

TIME_PATTERN = re.compile(r"^(?:(\d+):)?(\d{1,2}):(\d{2})$|^(\d+)$")

INVALID_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')

BTN_DOWNLOAD = "⚡ BAIXAR ⚡"
BTN_COMPRESS = "» COMPRIMIR «"

# --- Paleta cyberpunk ---------------------------------------------------
BG = "#080b14"
PANEL_BG = "#10192e"
FIELD_BG = "#0b1220"
BORDER = "#00fff2"
ACCENT = "#ff2bd6"
ACCENT_HOVER = "#ff6bea"
TEXT = "#e8feff"
TEXT_DIM = "#6fa3c0"
LOG_FG = "#39ff88"
FONT = "Consolas"


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


def find_ffprobe(ffmpeg_path: str | None) -> str | None:
    """O ffprobe vem junto do ffmpeg, então procura primeiro na mesma pasta."""
    if ffmpeg_path:
        sibling = os.path.join(os.path.dirname(ffmpeg_path), "ffprobe.exe")
        if os.path.isfile(sibling):
            return sibling
    return shutil.which("ffprobe")


def human_size(num_bytes: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if num_bytes < 1024 or unit == "GB":
            return f"{num_bytes:.1f} {unit}"
        num_bytes /= 1024
    return f"{num_bytes:.1f} GB"


def unique_output_path(src: str) -> str:
    base = os.path.splitext(src)[0]
    candidate = f"{base}_comprimido.mp4"
    counter = 2
    while os.path.exists(candidate):
        candidate = f"{base}_comprimido_{counter}.mp4"
        counter += 1
    return candidate


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


class DownloaderApp:
    def __init__(self, root):
        self.root = root
        root.title("Baixador de Clipes do YouTube")
        root.geometry("680x830")
        root.resizable(False, False)
        root.configure(bg=BG)

        self.ffmpeg_path = find_ffmpeg()
        self.ffprobe_path = find_ffprobe(self.ffmpeg_path)

        self._setup_style(root)

        # Cabeçalho
        tk.Label(root, text="⚡ BAIXADOR DE CLIPES // YT ⚡", bg=BG, fg=ACCENT,
                 font=(FONT, 16, "bold")).pack(pady=(14, 2))
        tk.Frame(root, bg=BORDER, height=2).pack(fill="x", padx=20, pady=(0, 10))

        notebook = ttk.Notebook(root, style="Neon.TNotebook")
        notebook.pack(fill="x", padx=10)

        download_tab = tk.Frame(notebook, bg=BG)
        compress_tab = tk.Frame(notebook, bg=BG)
        notebook.add(download_tab, text="BAIXAR")
        notebook.add(compress_tab, text="COMPRIMIR")

        self._build_download_tab(download_tab)
        self._build_compress_tab(compress_tab)

        self.progress = ttk.Progressbar(root, mode="determinate", style="Neon.Horizontal.TProgressbar")
        self.progress.pack(fill="x", padx=10, pady=(10, 0))

        # Log
        tk.Label(root, text="Status:", bg=BG, fg=TEXT_DIM,
                 font=(FONT, 9, "bold")).pack(anchor="w", padx=10, pady=(8, 0))
        self.log_text = tk.Text(root, height=8, state="disabled", wrap="word",
                                 bg=FIELD_BG, fg=LOG_FG, insertbackground=LOG_FG,
                                 font=(FONT, 9), bd=0, highlightthickness=1,
                                 highlightbackground=BORDER)
        self.log_text.pack(fill="both", expand=True, padx=10, pady=(4, 10))

        self._update_fields()

        if self.ffmpeg_path:
            self._log(f"ffmpeg encontrado: {self.ffmpeg_path}")
        else:
            self._log(
                "AVISO: ffmpeg não encontrado. Instale com 'winget install ffmpeg' "
                "e depois FECHE e ABRA este app de novo (o Windows só atualiza o "
                "PATH em janelas/processos novos)."
            )

    def _build_download_tab(self, parent):
        padding = {"padx": 6, "pady": 6}

        tk.Label(parent, text="Link do YouTube:", bg=BG, fg=TEXT_DIM,
                 font=(FONT, 9, "bold")).pack(anchor="w", padx=6, pady=(10, 4))
        self.url_entry = self._entry(parent, width=70)
        self.url_entry.pack(fill="x", padx=6)

        # Modo: vídeo / áudio
        mode_frame = self._panel(parent, "O que baixar")
        mode_frame.pack(fill="x", **padding)
        self.mode_var = tk.StringVar(value="video")
        self._radio(mode_frame, "Vídeo (com áudio)", "video", self.mode_var,
                    self._update_fields).pack(side="left", padx=10, pady=4)
        self._radio(mode_frame, "Só áudio", "audio", self.mode_var,
                    self._update_fields).pack(side="left", padx=10, pady=4)

        # Qualidade
        quality_frame = self._panel(parent, "Qualidade")
        quality_frame.pack(fill="x", **padding)

        self.res_label = tk.Label(quality_frame, text="Resolução do vídeo:",
                                   bg=PANEL_BG, fg=TEXT, font=(FONT, 9))
        self.res_label.grid(row=0, column=0, sticky="w", padx=10, pady=6)
        self.res_var = tk.StringVar(value="Melhor disponível")
        self.res_combo = ttk.Combobox(quality_frame, textvariable=self.res_var,
                                       values=list(RESOLUTIONS.keys()), state="readonly",
                                       width=20, style="Neon.TCombobox")
        self.res_combo.grid(row=0, column=1, sticky="w", padx=10, pady=6)

        self.audio_fmt_label = tk.Label(quality_frame, text="Formato de áudio:",
                                         bg=PANEL_BG, fg=TEXT, font=(FONT, 9))
        self.audio_fmt_label.grid(row=1, column=0, sticky="w", padx=10, pady=6)
        self.audio_fmt_var = tk.StringVar(value="mp3")
        self.audio_fmt_combo = ttk.Combobox(quality_frame, textvariable=self.audio_fmt_var,
                                             values=AUDIO_FORMATS, state="readonly",
                                             width=20, style="Neon.TCombobox")
        self.audio_fmt_combo.grid(row=1, column=1, sticky="w", padx=10, pady=6)

        # Corte de trecho
        clip_frame = self._panel(parent, "Cortar um trecho (opcional)")
        clip_frame.pack(fill="x", **padding)
        self.clip_var = tk.BooleanVar(value=False)
        self._check(clip_frame, "Baixar só um trecho do vídeo", self.clip_var,
                    self._update_fields).grid(row=0, column=0, columnspan=4, sticky="w", padx=10, pady=4)

        tk.Label(clip_frame, text="Início:", bg=PANEL_BG, fg=TEXT,
                 font=(FONT, 9)).grid(row=1, column=0, sticky="e", padx=(10, 2))
        self.start_entry = TimeMaskEntry(clip_frame, initial="0:00", width=10, **self._entry_kwargs())
        self.start_entry.grid(row=1, column=1, sticky="w", pady=4)

        tk.Label(clip_frame, text="Fim:", bg=PANEL_BG, fg=TEXT,
                 font=(FONT, 9)).grid(row=1, column=2, sticky="e", padx=(10, 2))
        self.end_entry = TimeMaskEntry(clip_frame, initial="0:30", width=10, **self._entry_kwargs())
        self.end_entry.grid(row=1, column=3, sticky="w", pady=4)

        tk.Label(clip_frame, text="(digite os números; formato MM:SS ou HH:MM:SS)",
                 bg=PANEL_BG, fg=TEXT_DIM, font=(FONT, 8)).grid(
            row=2, column=0, columnspan=4, sticky="w", padx=10, pady=(0, 4))

        # Nome do arquivo
        name_frame = self._panel(parent, "Nome do arquivo (opcional)")
        name_frame.pack(fill="x", **padding)
        self.filename_var = tk.StringVar(value="")
        self._entry(name_frame, textvariable=self.filename_var).pack(
            fill="x", padx=10, pady=(6, 0))
        tk.Label(name_frame, text="Em branco = usa o título do vídeo",
                 bg=PANEL_BG, fg=TEXT_DIM, font=(FONT, 8)).pack(
            anchor="w", padx=10, pady=(0, 6))

        # Pasta de destino
        out_frame = self._panel(parent, "Pasta de destino")
        out_frame.pack(fill="x", **padding)
        self.output_dir_var = tk.StringVar(value=load_last_output_dir())
        self._entry(out_frame, textvariable=self.output_dir_var).pack(
            side="left", padx=10, pady=6, fill="x", expand=True)
        self._button(out_frame, "Escolher...", self._choose_folder, small=True).pack(
            side="right", padx=10)

        self.download_btn = self._button(parent, BTN_DOWNLOAD, self._start_download)
        self.download_btn.pack(fill="x", padx=6, pady=(6, 10))

    def _build_compress_tab(self, parent):
        padding = {"padx": 6, "pady": 6}

        src_frame = self._panel(parent, "Arquivo de vídeo")
        src_frame.pack(fill="x", padx=6, pady=(12, 6))
        self.compress_src_var = tk.StringVar(value="")
        self._entry(src_frame, textvariable=self.compress_src_var).pack(
            side="left", padx=10, pady=6, fill="x", expand=True)
        self._button(src_frame, "Escolher...", self._choose_video, small=True).pack(
            side="right", padx=10)

        opts_frame = self._panel(parent, "Compressão")
        opts_frame.pack(fill="x", **padding)

        tk.Label(opts_frame, text="Qualidade:", bg=PANEL_BG, fg=TEXT,
                 font=(FONT, 9)).grid(row=0, column=0, sticky="w", padx=10, pady=6)
        self.comp_level_var = tk.StringVar(value="Alta qualidade (recomendado)")
        ttk.Combobox(opts_frame, textvariable=self.comp_level_var,
                     values=list(COMPRESSION_LEVELS.keys()), state="readonly",
                     width=30, style="Neon.TCombobox").grid(row=0, column=1, sticky="w", padx=10, pady=6)

        tk.Label(opts_frame, text="Codec:", bg=PANEL_BG, fg=TEXT,
                 font=(FONT, 9)).grid(row=1, column=0, sticky="w", padx=10, pady=6)
        self.comp_codec_var = tk.StringVar(value="H.264 (compatível com tudo)")
        ttk.Combobox(opts_frame, textvariable=self.comp_codec_var,
                     values=list(VIDEO_CODECS.keys()), state="readonly",
                     width=30, style="Neon.TCombobox").grid(row=1, column=1, sticky="w", padx=10, pady=6)

        tk.Label(opts_frame,
                 text="O áudio é copiado sem recodificar sempre que possível.\n"
                      "O arquivo original nunca é apagado nem sobrescrito.",
                 bg=PANEL_BG, fg=TEXT_DIM, font=(FONT, 8), justify="left").grid(
            row=2, column=0, columnspan=2, sticky="w", padx=10, pady=(0, 6))

        self.compress_btn = self._button(parent, BTN_COMPRESS, self._start_compress)
        self.compress_btn.pack(fill="x", padx=6, pady=(6, 10))

    # --- helpers de estilo ------------------------------------------------

    def _setup_style(self, root):
        style = ttk.Style(root)
        style.theme_use("clam")

        style.configure("Neon.TCombobox",
                         fieldbackground=FIELD_BG, background=FIELD_BG, foreground=TEXT,
                         arrowcolor=ACCENT, bordercolor=BORDER, lightcolor=BORDER,
                         darkcolor=BORDER, insertcolor=TEXT,
                         selectbackground=FIELD_BG, selectforeground=TEXT)
        style.map("Neon.TCombobox",
                  fieldbackground=[("readonly", FIELD_BG)],
                  foreground=[("readonly", TEXT)],
                  background=[("readonly", FIELD_BG)],
                  selectbackground=[("readonly", FIELD_BG), ("focus", FIELD_BG)],
                  selectforeground=[("readonly", TEXT), ("focus", TEXT)])

        style.configure("Neon.Horizontal.TProgressbar",
                         troughcolor=FIELD_BG, background=ACCENT,
                         bordercolor=BORDER, lightcolor=ACCENT, darkcolor=ACCENT,
                         thickness=14)

        style.configure("Neon.TNotebook", background=BG, borderwidth=0)
        style.configure("Neon.TNotebook.Tab", background=PANEL_BG, foreground=TEXT_DIM,
                         padding=[22, 7], font=(FONT, 9, "bold"), borderwidth=0)
        style.map("Neon.TNotebook.Tab",
                  background=[("selected", ACCENT)],
                  foreground=[("selected", "#0a0014")])

        root.option_add("*TCombobox*Listbox.background", FIELD_BG)
        root.option_add("*TCombobox*Listbox.foreground", TEXT)
        root.option_add("*TCombobox*Listbox.selectBackground", ACCENT)
        root.option_add("*TCombobox*Listbox.selectForeground", BG)

    def _panel(self, parent, text):
        return tk.LabelFrame(parent, text=text, bg=PANEL_BG, fg=BORDER,
                              font=(FONT, 9, "bold"), bd=0,
                              highlightthickness=1, highlightbackground=BORDER,
                              labelanchor="nw")

    def _entry_kwargs(self):
        return dict(bg=FIELD_BG, fg=TEXT, insertbackground=TEXT, relief="flat",
                    bd=6, highlightthickness=1, highlightbackground=BORDER,
                    highlightcolor=ACCENT, font=(FONT, 10))

    def _entry(self, parent, **kwargs):
        return tk.Entry(parent, **self._entry_kwargs(), **kwargs)

    def _radio(self, parent, text, value, variable, command):
        return tk.Radiobutton(parent, text=text, value=value, variable=variable,
                               command=command, bg=PANEL_BG, fg=TEXT,
                               selectcolor=FIELD_BG, activebackground=PANEL_BG,
                               activeforeground=ACCENT, font=(FONT, 9),
                               highlightthickness=0, bd=0)

    def _check(self, parent, text, variable, command):
        return tk.Checkbutton(parent, text=text, variable=variable, command=command,
                               bg=PANEL_BG, fg=TEXT, selectcolor=FIELD_BG,
                               activebackground=PANEL_BG, activeforeground=ACCENT,
                               font=(FONT, 9), highlightthickness=0, bd=0)

    def _button(self, parent, text, command, small=False):
        btn = tk.Button(parent, text=text, command=command, bg=ACCENT, fg="#0a0014",
                         activebackground=ACCENT_HOVER, activeforeground="#0a0014",
                         font=(FONT, 9 if small else 12, "bold"), bd=0, relief="flat",
                         highlightthickness=1, highlightbackground=BORDER,
                         cursor="hand2", padx=10 if small else 0, pady=2 if small else 8)
        btn.bind("<Enter>", lambda _e: btn.config(bg=ACCENT_HOVER))
        btn.bind("<Leave>", lambda _e: btn.config(bg=ACCENT if btn["state"] != "disabled" else FIELD_BG))
        return btn

    # --- estado da interface -----------------------------------------------

    def _update_fields(self):
        mode = self.mode_var.get()
        show_res = mode == "video"
        show_audio_fmt = mode == "audio"
        self.res_label.grid_remove() if not show_res else self.res_label.grid()
        self.res_combo.grid_remove() if not show_res else self.res_combo.grid()
        self.audio_fmt_label.grid_remove() if not show_audio_fmt else self.audio_fmt_label.grid()
        self.audio_fmt_combo.grid_remove() if not show_audio_fmt else self.audio_fmt_combo.grid()

        clip_on = self.clip_var.get()
        state = "normal" if clip_on else "disabled"
        self.start_entry.config(state=state)
        self.end_entry.config(state=state)

    def _set_busy(self, busy):
        """Uma operação de cada vez: baixar e comprimir usam a mesma barra."""
        for btn, text in ((self.download_btn, BTN_DOWNLOAD), (self.compress_btn, BTN_COMPRESS)):
            if busy:
                btn.config(state="disabled", bg=FIELD_BG)
            else:
                btn.config(state="normal", text=text, bg=ACCENT)

    def _choose_folder(self):
        folder = filedialog.askdirectory()
        if folder:
            self.output_dir_var.set(folder)
            save_last_output_dir(folder)

    def _choose_video(self):
        path = filedialog.askopenfilename(
            title="Escolha o vídeo para comprimir",
            filetypes=[("Vídeos", "*.mp4 *.mkv *.mov *.avi *.webm *.m4v *.wmv *.flv"),
                       ("Todos os arquivos", "*.*")],
        )
        if path:
            self.compress_src_var.set(path)

    def _log(self, message: str):
        self.log_text.config(state="normal")
        self.log_text.insert("end", message + "\n")
        self.log_text.see("end")
        self.log_text.config(state="disabled")

    def _missing_ffmpeg_error(self):
        messagebox.showerror(
            "ffmpeg não encontrado",
            "O ffmpeg não foi encontrado neste computador.\n\n"
            "1. Instale com: winget install ffmpeg\n"
            "2. Feche este app e abra de novo (uma janela/processo já "
            "aberto não enxerga o PATH atualizado pelo instalador).\n\n"
            "Veja o README.md para instruções detalhadas.",
        )

    # --- download ----------------------------------------------------------

    def _start_download(self):
        url = self.url_entry.get().strip()
        if not url:
            messagebox.showerror("Erro", "Cole um link do YouTube primeiro.")
            return

        if not self.ffmpeg_path:
            self._missing_ffmpeg_error()
            return

        try:
            start_s = end_s = None
            if self.clip_var.get():
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

        filename = sanitize_filename(self.filename_var.get())

        self._set_busy(True)
        self.download_btn.config(text="Baixando...")
        self.progress["value"] = 0
        self._log(f"Iniciando download: {url}")

        thread = threading.Thread(
            target=self._run_download,
            args=(url, output_dir, filename, start_s, end_s),
            daemon=True,
        )
        thread.start()

    def _progress_hook(self, d):
        if d["status"] == "downloading":
            pct = d.get("_percent_str", "").strip()
            self.root.after(0, self._set_progress_text, pct)
        elif d["status"] == "finished":
            self.root.after(0, self._log, "Processando arquivo (ffmpeg)...")

    def _set_progress_text(self, pct_str):
        try:
            pct = float(pct_str.replace("%", ""))
            self.progress["value"] = pct
        except ValueError:
            pass

    def _run_download(self, url, output_dir, filename, start_s, end_s):
        mode = self.mode_var.get()
        name_part = filename if filename else "%(title)s"
        outtmpl = os.path.join(output_dir, f"{name_part}.%(ext)s")

        if self.ffmpeg_path:
            # yt-dlp's own "is ffmpeg available" check for partial/range
            # downloads (used when cortando um trecho) ignores the
            # "ffmpeg_location" YoutubeDL option and only looks at this
            # contextvar (the yt-dlp CLI sets it the same way). Must be set
            # from within this thread since contextvars don't cross threads.
            FFmpegPostProcessor._ffmpeg_location.set(self.ffmpeg_path)

        try:
            if mode == "audio":
                self._download_audio(url, outtmpl, start_s, end_s)
            else:
                self._download_video(url, outtmpl, start_s, end_s)
            self.root.after(0, self._on_success, output_dir)
        except Exception as exc:  # noqa: BLE001 - mostrado ao usuário na GUI
            self.root.after(0, self._on_error, str(exc))

    def _build_ydl_opts(self, outtmpl, start_s, end_s):
        opts = {
            "outtmpl": outtmpl,
            "progress_hooks": [self._progress_hook],
            "quiet": True,
            "no_warnings": True,
        }
        if self.ffmpeg_path:
            opts["ffmpeg_location"] = self.ffmpeg_path
        if start_s is not None and end_s is not None:
            opts["download_ranges"] = download_range_func(None, [(start_s, end_s)])
            opts["force_keyframes_at_cuts"] = True
        return opts

    def _download_video(self, url, outtmpl, start_s, end_s):
        height = RESOLUTIONS[self.res_var.get()]
        if height:
            fmt = f"bestvideo[height<={height}]+bestaudio/best[height<={height}]"
        else:
            fmt = "bestvideo+bestaudio/best"

        opts = self._build_ydl_opts(outtmpl, start_s, end_s)
        opts["format"] = fmt
        opts["merge_output_format"] = "mp4"

        self.root.after(0, self._log, "Baixando vídeo...")
        with YoutubeDL(opts) as ydl:
            ydl.download([url])

    def _download_audio(self, url, outtmpl, start_s, end_s):
        audio_fmt = self.audio_fmt_var.get()

        opts = self._build_ydl_opts(outtmpl, start_s, end_s)
        opts["format"] = "bestaudio/best"
        opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": audio_fmt,
            "preferredquality": "192",
        }]

        self.root.after(0, self._log, "Baixando áudio...")
        with YoutubeDL(opts) as ydl:
            ydl.download([url])

    def _on_success(self, output_dir):
        self.progress["value"] = 100
        self._log(f"Concluído! Arquivos salvos em: {output_dir}")
        self._set_busy(False)
        messagebox.showinfo("Pronto", f"Download concluído!\nSalvo em:\n{output_dir}")

    def _on_error(self, message):
        self._log(f"ERRO: {message}")
        self._set_busy(False)
        messagebox.showerror("Erro no download", message)

    # --- compressão --------------------------------------------------------

    def _start_compress(self):
        src = self.compress_src_var.get().strip().strip('"')
        if not src:
            messagebox.showerror("Erro", "Escolha um arquivo de vídeo primeiro.")
            return
        if not os.path.isfile(src):
            messagebox.showerror("Erro", f"Arquivo não encontrado:\n{src}")
            return
        if not self.ffmpeg_path:
            self._missing_ffmpeg_error()
            return

        level = COMPRESSION_LEVELS[self.comp_level_var.get()]
        codec = VIDEO_CODECS[self.comp_codec_var.get()]
        # Para a mesma qualidade percebida, o x265 precisa de um CRF mais
        # alto que o x264 — sem isso o mesmo rótulo geraria resultados
        # bem diferentes entre os dois codecs.
        crf = level["crf"] + (2 if codec == "libx265" else 0)

        dest = unique_output_path(src)

        self._set_busy(True)
        self.compress_btn.config(text="Comprimindo...")
        self.progress["value"] = 0
        self._log(f"Comprimindo: {os.path.basename(src)} ({human_size(os.path.getsize(src))})")

        thread = threading.Thread(
            target=self._run_compress,
            args=(src, dest, codec, crf, level["preset"]),
            daemon=True,
        )
        thread.start()

    def _probe_media(self, src):
        """Retorna (duração em segundos, codec de áudio). Ambos podem ser None."""
        if not self.ffprobe_path:
            return None, None
        try:
            output = subprocess.run(
                [self.ffprobe_path, "-v", "quiet", "-print_format", "json",
                 "-show_format", "-show_streams", src],
                capture_output=True, text=True, check=True, stdin=subprocess.DEVNULL,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            ).stdout
            data = json.loads(output)
        except (OSError, ValueError, subprocess.SubprocessError):
            return None, None

        try:
            duration = float(data["format"]["duration"])
        except (KeyError, TypeError, ValueError):
            duration = None

        audio_codec = None
        for stream in data.get("streams", []):
            if stream.get("codec_type") == "audio":
                audio_codec = stream.get("codec_name")
                break
        return duration, audio_codec

    def _run_compress(self, src, dest, codec, crf, preset):
        try:
            duration, audio_codec = self._probe_media(src)

            audio_args = (["-c:a", "copy"] if audio_codec in MP4_SAFE_AUDIO
                          else ["-c:a", "aac", "-b:a", "192k"])

            cmd = [
                self.ffmpeg_path, "-hide_banner", "-y", "-i", src,
                "-c:v", codec, "-crf", str(crf), "-preset", preset,
                *audio_args,
                "-movflags", "+faststart",
                "-progress", "pipe:1", "-nostats",
                dest,
            ]

            self.root.after(0, self._log,
                            f"Codec {codec}, CRF {crf}, preset {preset}. Isso pode demorar...")

            proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,  # senão o ffmpeg fica lendo o stdin do app
                text=True, encoding="utf-8", errors="replace", bufsize=1,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )

            tail = []
            for line in proc.stdout:
                line = line.strip()
                key, sep, value = line.partition("=")
                if sep and (key in FFMPEG_PROGRESS_KEYS or key.startswith("stream_")):
                    if key == "out_time_us" and duration:
                        try:
                            pct = min(100.0, int(value) / 1_000_000 / duration * 100)
                        except ValueError:
                            continue  # ffmpeg manda "N/A" em alguns blocos
                        self.root.after(0, self._set_progress_value, pct)
                elif line:
                    # Não é linha de progresso: guarda para explicar um erro.
                    tail.append(line)
                    del tail[:-25]

            if proc.wait() != 0:
                raise RuntimeError("O ffmpeg falhou:\n" + "\n".join(tail[-8:]))

            self.root.after(0, self._on_compress_success, src, dest)
        except Exception as exc:  # noqa: BLE001 - mostrado ao usuário na GUI
            if os.path.exists(dest):
                try:
                    os.remove(dest)  # não deixa arquivo parcial para trás
                except OSError:
                    pass
            self.root.after(0, self._on_compress_error, str(exc))

    def _set_progress_value(self, pct):
        self.progress["value"] = pct

    def _on_compress_success(self, src, dest):
        self.progress["value"] = 100
        before = os.path.getsize(src)
        after = os.path.getsize(dest)

        if after < before:
            diff = f"{(1 - after / before) * 100:.0f}% menor"
            extra = ""
        else:
            # Reencodar um vídeo já bem comprimido pode aumentá-lo.
            diff = f"{(after / before - 1) * 100:.0f}% MAIOR"
            extra = ("\n\nO original já estava bem comprimido, então recomprimir "
                     "não ajudou. Vale manter o arquivo original, ou tentar o "
                     "codec H.265 / uma qualidade mais baixa.")

        self._log(f"Concluído! {human_size(before)} -> {human_size(after)} ({diff})")
        self._log(f"Salvo em: {dest}")
        self._set_busy(False)
        messagebox.showinfo(
            "Pronto",
            f"Compressão concluída!\n\n"
            f"Antes: {human_size(before)}\n"
            f"Depois: {human_size(after)} ({diff})\n\n"
            f"Salvo em:\n{dest}{extra}",
        )

    def _on_compress_error(self, message):
        self._log(f"ERRO: {message}")
        self._set_busy(False)
        messagebox.showerror("Erro na compressão", message)


if __name__ == "__main__":
    root = tk.Tk()
    DownloaderApp(root)
    root.mainloop()
