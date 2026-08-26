// PROTOTYPE — throwaway. See prototype/home-bg-art comment in src/pages/index.astro.
// コード/楽譜スニペットは実データ(自分のリポジトリ/lilypond)から採取。

export const codeSnippets: { lang: string; code: string }[] = [
  {
    lang: 'rust',
    code: `pub fn midi_note_to_freq(note: u8) -> f32 {
    440.0 * 2f32.powf((note as f32 - 69.0) / 12.0)
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum NoteAction {
    Retrigger { freq: f32, velocity: f32 },
    Legato { freq: f32, velocity: f32 },
    FallbackTo { freq: f32 },
    Silence,
    Ignored,
}`,
  },
  {
    lang: 'typescript',
    code: `const weeks: Day[][] = [];
let week: Day[] = [];
for (const day of days) {
  const dow = new Date(day.date).getUTCDay();
  if (week.length === 0 && dow !== 0) {
    for (let i = 0; i < dow; i++) week.push({ date: '', count: 0, level: -1 });
  }
  week.push(day);
  if (dow === 6) {
    weeks.push(week);
    week = [];
  }
}`,
  },
  {
    lang: 'gdscript',
    code: `func _build() -> void:
    # --- 3D描画ビューポート ---
    sub3d = SubViewport.new()
    sub3d.size = LOW
    sub3d.render_target_update_mode = SubViewport.UPDATE_ALWAYS

func _render_and_save() -> void:
    for i in range(FRAMES):
        pivot.rotation.y = TAU * i / FRAMES
        await RenderingServer.frame_post_draw`,
  },
  {
    lang: 'python',
    code: `def analyze(wav_path: str) -> dict:
    rate, data = wavfile.read(wav_path)
    peak = np.max(np.abs(data))
    rms = np.sqrt(np.mean(data.astype(np.float64) ** 2))
    spectrum = np.fft.rfft(data[center - 4096 : center + 4096])
    return {"peak_dbfs": to_dbfs(peak), "rms_dbfs": to_dbfs(rms)}`,
  },
];

export const scoreFiles = ['score-1.svg', 'score-2.svg', 'score-3.svg', 'score-4.svg'];
