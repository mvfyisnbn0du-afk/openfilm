/**
 * What this release brings, said to the person after an update, in every language Studio speaks (a release without them
 * all does not compile), grouped as new, improved and fixed. Only this release's: the dialog tells what the version now
 * running brings, and the changelog on GitHub keeps every release's.
 *
 * Written when a release is made (the "Version packages" pull request), in place of the release before's: the
 * changesets say everything that changed, for the changelog; these say every change a person would notice, in their
 * words, one line each (at most 24). A version without them fails the tests (whats-new.test.ts), so that pull request
 * cannot be merged until they are written.
 *
 * After an update they appear once (Studio's prefs keep `seenVersion`). A new install shows none: there is nothing it
 * was updated from.
 */
import type { Language } from '@/i18n';

export type NoteKind = 'new' | 'improved' | 'fixed';
export interface ReleaseNote { kind: NoteKind; text: string }
export interface ReleaseNotes { version: string; date: string; notes: Record<Language, ReleaseNote[]> }

export const RELEASE: ReleaseNotes = {
  version: '0.2.7',
  date: '2026-10-28',
  notes: {
    en: [
      { kind: 'new', text: 'The viewer plays at 3× and 4× too, the sound’s pitch kept. Its Playback menu is laid out anew: Loop, and the speeds from 0.25× to 4× in two rows.' },
      { kind: 'improved', text: 'A picture in the chat opens in a light viewer: Esc, a click beside it or × closes it, and Download is in its right-click menu.' },
      { kind: 'improved', text: 'Settings › Agents says when Claude Code is older than the one OpenFilm was tested with, and gives the command that updates it.' },
      { kind: 'improved', text: 'J/K/L: 4× forward plays with sound.' },
      { kind: 'improved', text: 'Windows: looking at the agents no longer holds the windows; the installed apps are read in the background.' },
      { kind: 'improved', text: 'DeepSeek Harness: signed in only to your account, a model that needs an API key says so, and switches to the account’s model in one click.' },
      { kind: 'fixed', text: 'Windows: a skill of your own or of a project is no longer emptied when OpenFilm tidies an agent\'s old session.' },
      { kind: 'fixed', text: 'Exports: ProRes footage with sound, as most cameras record it, no longer comes out black.' },
      { kind: 'fixed', text: 'Videos with transparency (WebM, Apple HEVC) stay transparent in the preview and in exports, instead of showing a solid color behind them.' },
      { kind: 'fixed', text: 'A new project starts in the subtitle look you used last, and its burned-in subtitles match what Studio shows.' },
    ],
    'zh-CN': [
      { kind: 'new', text: '预览可以 3× 和 4× 播放，声音音调不变。播放设置菜单重新设计：循环播放，以及 0.25× 到 4× 的速度，分两行排列。' },
      { kind: 'improved', text: '对话里的图片改用轻量预览：按 Esc、点旁边或 × 关闭，右键菜单里可以下载。' },
      { kind: 'improved', text: '设置 › 智能体：Claude Code 比 OpenFilm 测试过的版本旧时会提示，并给出更新命令。' },
      { kind: 'improved', text: 'J/K/L：快进到 4× 时带声音播放。' },
      { kind: 'improved', text: 'Windows：查看智能体时窗口不再卡住，已安装的程序改在后台读取。' },
      { kind: 'improved', text: 'DeepSeek Harness：只登录了账号时，选到需要 API key 的模型会说明原因，并可一键换成账号能用的模型。' },
      { kind: 'fixed', text: 'Windows：OpenFilm 清理 Agent 的旧会话时，不会再清空你自己或项目里的 skill。' },
      { kind: 'fixed', text: '导出：大多数相机录的带声音的 ProRes 素材不再导出成黑屏。' },
      { kind: 'fixed', text: '带透明的视频（WebM、苹果 HEVC）在预览和导出中都保持透明，不再露出纯色背景。' },
      { kind: 'fixed', text: '新建项目沿用上次的字幕样式，烧录到画面的字幕和 Studio 里看到的一致。' },
      { kind: 'fixed', text: '设置 › 智能体 › 自有密钥：三条报错的中文措辞更自然。' },
    ],
    ja: [
      { kind: 'new', text: 'プレビューを 3× と 4× でも再生できます（音のピッチはそのまま）。再生設定メニューを作り直しました：ループ再生と、0.25× から 4× までの速度を 2 行に並べています。' },
      { kind: 'improved', text: 'チャットの画像は軽いビューアーで開きます。Esc、外側のクリック、× で閉じ、右クリックメニューからダウンロードできます。' },
      { kind: 'improved', text: '設定 › エージェント：Claude Code が OpenFilm で確認したバージョンより古いと知らせ、更新するコマンドを表示します。' },
      { kind: 'improved', text: 'J/K/L：4× の早送りが音付きで再生されます。' },
      { kind: 'improved', text: 'Windows：エージェントを表示してもウィンドウが固まらなくなりました。インストール済みのアプリはバックグラウンドで読み込みます。' },
      { kind: 'improved', text: 'DeepSeek Harness：アカウントだけでサインインしているとき、API キーが必要なモデルはその旨を伝え、アカウントで使えるモデルにワンクリックで切り替えられます。' },
      { kind: 'fixed', text: 'Windows：OpenFilm が Agent の古いセッションを片付けるとき、あなたやプロジェクトの skill が空になることはなくなりました。' },
      { kind: 'fixed', text: '書き出し：多くのカメラが記録する音声付きの ProRes が、黒い画面で書き出されなくなりました。' },
      { kind: 'fixed', text: '透過付きの動画（WebM、Apple の HEVC）は、プレビューでも書き出しでも透過のままになり、背景に単色が出なくなりました。' },
      { kind: 'fixed', text: '新しいプロジェクトは前回の字幕スタイルで始まり、焼き込み字幕が Studio の表示と一致します。' },
      { kind: 'fixed', text: '設定 › エージェント › 自分のキー：3 つのエラーメッセージの日本語がより自然になりました。' },
    ],
    ko: [
      { kind: 'new', text: '미리보기를 3×와 4×로도 재생할 수 있습니다(음높이는 그대로). 재생 설정 메뉴를 새로 구성했습니다: 반복 재생, 그리고 0.25×부터 4×까지의 속도를 두 줄로 보여 줍니다.' },
      { kind: 'improved', text: '채팅의 이미지는 가벼운 뷰어로 열립니다. Esc, 바깥 클릭 또는 ×로 닫고, 오른쪽 클릭 메뉴에서 다운로드할 수 있습니다.' },
      { kind: 'improved', text: '설정 › 에이전트: Claude Code가 OpenFilm에서 테스트한 버전보다 오래되었으면 알려 주고 업데이트 명령을 보여 줍니다.' },
      { kind: 'improved', text: 'J/K/L: 4× 빨리 감기가 소리와 함께 재생됩니다.' },
      { kind: 'improved', text: 'Windows: 에이전트를 볼 때 창이 멈추지 않습니다. 설치된 앱은 백그라운드에서 읽습니다.' },
      { kind: 'improved', text: 'DeepSeek Harness: 계정으로만 로그인했을 때 API 키가 필요한 모델은 그 이유를 알려 주고, 계정에서 쓸 수 있는 모델로 한 번에 바꿀 수 있습니다.' },
      { kind: 'fixed', text: 'Windows: OpenFilm이 에이전트의 오래된 세션을 정리할 때 내 skill이나 프로젝트의 skill이 더 이상 비워지지 않습니다.' },
      { kind: 'fixed', text: '내보내기: 대부분의 카메라가 녹화하는 소리 있는 ProRes 영상이 더 이상 검은 화면으로 내보내지지 않습니다.' },
      { kind: 'fixed', text: '투명 배경이 있는 영상(WebM, Apple HEVC)이 미리보기와 내보내기에서 투명하게 유지되며, 뒤에 단색이 보이지 않습니다.' },
      { kind: 'fixed', text: '새 프로젝트는 마지막으로 사용한 자막 스타일로 시작하며, 화면에 입힌 자막이 Studio에서 보이는 것과 같습니다.' },
      { kind: 'fixed', text: '설정 › 에이전트 › 내 키: 오류 메시지 세 개의 한국어 표현이 더 자연스러워졌습니다.' },
    ],
    es: [
      { kind: 'new', text: 'El visor también reproduce a 3× y 4×, con el tono del sonido intacto. El menú Reproducción se ha rehecho: Bucle y las velocidades de 0.25× a 4× en dos filas.' },
      { kind: 'improved', text: 'Una imagen del chat se abre en un visor ligero: Esc, un clic fuera o × lo cierran, y Descargar está en su menú contextual.' },
      { kind: 'improved', text: 'Configuración › Agentes avisa cuando Claude Code es más antiguo que la versión probada con OpenFilm y da el comando para actualizarlo.' },
      { kind: 'improved', text: 'J/K/L: el avance a 4× se reproduce con sonido.' },
      { kind: 'improved', text: 'Windows: mirar los agentes ya no congela las ventanas; las apps instaladas se leen en segundo plano.' },
      { kind: 'improved', text: 'DeepSeek Harness: con solo la cuenta iniciada, un modelo que necesita clave de API lo dice y cambia al modelo de la cuenta con un clic.' },
      { kind: 'fixed', text: 'Windows: al limpiar la sesión antigua de un agente, OpenFilm ya no vacía tus skills ni las del proyecto.' },
      { kind: 'fixed', text: 'Exportaciones: el metraje ProRes con sonido, como lo graban la mayoría de las cámaras, ya no sale en negro.' },
      { kind: 'fixed', text: 'Los vídeos con transparencia (WebM, HEVC de Apple) siguen transparentes en la vista previa y en las exportaciones, sin un color sólido detrás.' },
      { kind: 'fixed', text: 'Un proyecto nuevo empieza con el estilo de subtítulos que usaste por última vez, y los subtítulos incrustados coinciden con lo que muestra Studio.' },
      { kind: 'fixed', text: 'Configuración › Agentes › Tu propia clave: tres mensajes de error se leen con más naturalidad en español.' },
    ],
  },
};

/** -1, 0 or 1 as `a` is older than, the same as or newer than `b` (x.y.z; a pre-release is older than its release). */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre = ''] = v.split('-');
    return { parts: core.split('.').map((n) => Number(n) || 0), pre };
  };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.parts[i] ?? 0) - (y.parts[i] ?? 0);
    if (d) return Math.sign(d);
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

/** This release's notes when `version` is this release, else null. */
export function releaseNotes(version: string, release: ReleaseNotes = RELEASE): ReleaseNotes | null {
  return compareVersions(release.version, version) === 0 ? release : null;
}

/** Said on the window to show this release's notes again (Settings → About, Developer's preview). */
export const WHATS_NEW_EVENT = 'openfilm:whats-new';
export function showWhatsNew(): void {
  window.dispatchEvent(new CustomEvent(WHATS_NEW_EVENT));
}
