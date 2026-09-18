"""
Baixador de Clipes do YouTube
=============================

App simples com janela (Tkinter) para baixar vídeo e/ou áudio do YouTube,
com opção de cortar um trecho específico (início/fim). Usa yt-dlp + ffmpeg.

Como rodar:
    pip install -r requirements.txt
    python app.py

Requer o ffmpeg instalado e disponível no PATH do Windows
(veja instruções no README.md).
"""

import os
import re
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

from yt_dlp import YoutubeDL
from yt_dlp.utils import download_range_func

DEFAULT_OUTPUT_DIR = os.path.join(os.path.expanduser("~"), "Videos", "Clipes")

RESOLUTIONS = {
    "Melhor disponível": None,
    "1080p": 1080,
    "720p": 720,
    "480p": 480,
    "360p": 360,
}

AUDIO_FORMATS = ["mp3", "m4a", "wav"]

TIME_PATTERN = re.compile(r"^(?:(\d+):)?(\d{1,2}):(\d{2})$|^(\d+)$")


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


class DownloaderApp:
    def __init__(self, root):
        self.root = root
        root.title("Baixador de Clipes do YouTube")
        root.geometry("560x520")
        root.resizable(False, False)

        padding = {"padx": 10, "pady": 6}

        # URL
        tk.Label(root, text="Link do YouTube:").pack(anchor="w", **padding)
        self.url_entry = tk.Entry(root, width=70)
        self.url_entry.pack(fill="x", padx=10)

        # Modo: vídeo / áudio / ambos
        mode_frame = tk.LabelFrame(root, text="O que baixar")
        mode_frame.pack(fill="x", **padding)
        self.mode_var = tk.StringVar(value="video")
        tk.Radiobutton(mode_frame, text="Vídeo", variable=self.mode_var,
                        value="video", command=self._update_fields).pack(side="left", padx=10, pady=4)
        tk.Radiobutton(mode_frame, text="Áudio", variable=self.mode_var,
                        value="audio", command=self._update_fields).pack(side="left", padx=10, pady=4)
        tk.Radiobutton(mode_frame, text="Ambos (vídeo + áudio separado)", variable=self.mode_var,
                        value="both", command=self._update_fields).pack(side="left", padx=10, pady=4)

        # Qualidade
        quality_frame = tk.LabelFrame(root, text="Qualidade")
        quality_frame.pack(fill="x", **padding)

        self.res_label = tk.Label(quality_frame, text="Resolução do vídeo:")
        self.res_label.grid(row=0, column=0, sticky="w", padx=10, pady=6)
        self.res_var = tk.StringVar(value="Melhor disponível")
        self.res_combo = ttk.Combobox(quality_frame, textvariable=self.res_var,
                                       values=list(RESOLUTIONS.keys()), state="readonly", width=20)
        self.res_combo.grid(row=0, column=1, sticky="w", padx=10, pady=6)

        self.audio_fmt_label = tk.Label(quality_frame, text="Formato de áudio:")
        self.audio_fmt_label.grid(row=1, column=0, sticky="w", padx=10, pady=6)
        self.audio_fmt_var = tk.StringVar(value="mp3")
        self.audio_fmt_combo = ttk.Combobox(quality_frame, textvariable=self.audio_fmt_var,
                                             values=AUDIO_FORMATS, state="readonly", width=20)
        self.audio_fmt_combo.grid(row=1, column=1, sticky="w", padx=10, pady=6)

        # Corte de trecho
        clip_frame = tk.LabelFrame(root, text="Cortar um trecho (opcional)")
        clip_frame.pack(fill="x", **padding)
        self.clip_var = tk.BooleanVar(value=False)
        tk.Checkbutton(clip_frame, text="Baixar só um trecho do vídeo", variable=self.clip_var,
                        command=self._update_fields).grid(row=0, column=0, columnspan=4, sticky="w", padx=10, pady=4)

        tk.Label(clip_frame, text="Início:").grid(row=1, column=0, sticky="e", padx=(10, 2))
        self.start_entry = tk.Entry(clip_frame, width=10)
        self.start_entry.grid(row=1, column=1, sticky="w", pady=4)
        self.start_entry.insert(0, "0:00")

        tk.Label(clip_frame, text="Fim:").grid(row=1, column=2, sticky="e", padx=(10, 2))
        self.end_entry = tk.Entry(clip_frame, width=10)
        self.end_entry.grid(row=1, column=3, sticky="w", pady=4)
        self.end_entry.insert(0, "0:30")

        tk.Label(clip_frame, text="(formato: MM:SS ou HH:MM:SS)").grid(
            row=2, column=0, columnspan=4, sticky="w", padx=10, pady=(0, 4))

        # Pasta de destino
        out_frame = tk.LabelFrame(root, text="Pasta de destino")
        out_frame.pack(fill="x", **padding)
        self.output_dir_var = tk.StringVar(value=DEFAULT_OUTPUT_DIR)
        tk.Entry(out_frame, textvariable=self.output_dir_var, width=50).pack(
            side="left", padx=10, pady=6, fill="x", expand=True)
        tk.Button(out_frame, text="Escolher...", command=self._choose_folder).pack(side="left", padx=10)

        # Botão baixar
        self.download_btn = tk.Button(root, text="Baixar", command=self._start_download,
                                       bg="#c00", fg="white", font=("Segoe UI", 11, "bold"), height=1)
        self.download_btn.pack(fill="x", padx=10, pady=(4, 6))

        self.progress = ttk.Progressbar(root, mode="determinate")
        self.progress.pack(fill="x", padx=10)

        # Log
        tk.Label(root, text="Status:").pack(anchor="w", padx=10)
        self.log_text = tk.Text(root, height=10, state="disabled", wrap="word")
        self.log_text.pack(fill="both", expand=True, padx=10, pady=(0, 10))

        self._update_fields()

    def _update_fields(self):
        mode = self.mode_var.get()
        show_res = mode in ("video", "both")
        show_audio_fmt = mode in ("audio", "both")
        self.res_label.grid_remove() if not show_res else self.res_label.grid()
        self.res_combo.grid_remove() if not show_res else self.res_combo.grid()
        self.audio_fmt_label.grid_remove() if not show_audio_fmt else self.audio_fmt_label.grid()
        self.audio_fmt_combo.grid_remove() if not show_audio_fmt else self.audio_fmt_combo.grid()

        clip_on = self.clip_var.get()
        state = "normal" if clip_on else "disabled"
        self.start_entry.config(state=state)
        self.end_entry.config(state=state)

    def _choose_folder(self):
        folder = filedialog.askdirectory()
        if folder:
            self.output_dir_var.set(folder)

    def _log(self, message: str):
        self.log_text.config(state="normal")
        self.log_text.insert("end", message + "\n")
        self.log_text.see("end")
        self.log_text.config(state="disabled")

    def _start_download(self):
        url = self.url_entry.get().strip()
        if not url:
            messagebox.showerror("Erro", "Cole um link do YouTube primeiro.")
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

        self.download_btn.config(state="disabled", text="Baixando...")
        self.progress["value"] = 0
        self._log(f"Iniciando download: {url}")

        thread = threading.Thread(
            target=self._run_download,
            args=(url, output_dir, start_s, end_s),
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

    def _run_download(self, url, output_dir, start_s, end_s):
        mode = self.mode_var.get()
        outtmpl = os.path.join(output_dir, "%(title)s.%(ext)s")

        try:
            if mode in ("video", "both"):
                self._download_video(url, outtmpl, start_s, end_s)
            if mode in ("audio", "both"):
                self._download_audio(url, outtmpl, start_s, end_s)
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
        self.download_btn.config(state="normal", text="Baixar")
        messagebox.showinfo("Pronto", f"Download concluído!\nSalvo em:\n{output_dir}")

    def _on_error(self, message):
        self._log(f"ERRO: {message}")
        self.download_btn.config(state="normal", text="Baixar")
        messagebox.showerror("Erro no download", message)


if __name__ == "__main__":
    root = tk.Tk()
    DownloaderApp(root)
    root.mainloop()
