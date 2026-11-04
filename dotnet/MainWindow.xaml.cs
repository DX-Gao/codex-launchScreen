using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;

namespace CodexSplash
{
    public partial class MainWindow : Window
    {
        private AppConfig _cfg;
        private string _root;
        private string _mediaPath;

        private double _loopFrom;
        private DateTime _startedAt;
        private bool _videoDone;
        private bool _appReady;
        private bool _appLaunched;
        private bool _closing;
        private bool _fadedIn;

        private DispatcherTimer _tick;

        public MainWindow()
        {
            InitializeComponent();
            Loaded += OnLoaded;
            KeyDown += OnKeyDown;
            // 启动后 900ms 内的点击一律忽略：双击图标时第二下很容易落到刚弹出的窗口上
            MouseLeftButtonDown += (s, e) =>
            {
                if (InputAllowed()) CloseWithFade(260);
            };
            _startedAt = DateTime.Now;
        }

        private bool InputAllowed()
        {
            return (DateTime.Now - _startedAt).TotalMilliseconds > 900;
        }

        /* ----------------------------- 启动 ----------------------------- */

        private void OnLoaded(object sender, RoutedEventArgs e)
        {
            _root = FindRoot();
            Log("--- start, root=" + _root);

            try
            {
                var json = File.ReadAllText(Path.Combine(_root, "launcher.json"));
                _cfg = JsonSerializer.Deserialize<AppConfig>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true,
                    ReadCommentHandling = JsonCommentHandling.Skip,
                    AllowTrailingCommas = true
                });
            }
            catch (Exception ex)
            {
                Fail("读取 launcher.json 失败：" + ex.Message);
                return;
            }

            if (_cfg == null || _cfg.animations == null || _cfg.animations.Count == 0)
            {
                Fail("launcher.json 里没有配置任何动画。");
                return;
            }

            // --preview：只播动画，不拉应用、不等就绪（给设置面板的预览用）
            bool preview = Environment.GetCommandLineArgs()
                .Any(a => string.Equals(a, "--preview", StringComparison.OrdinalIgnoreCase));
            if (preview)
            {
                Log("preview mode");
                _cfg.appLaunch = new LaunchTarget { enabled = false };
                _cfg.waitForApp = false;
            }

            // 预览时可以通过环境变量指定播哪一条
            string wantId = Environment.GetEnvironmentVariable("SPLASH_PREVIEW_ID");
            if (string.IsNullOrWhiteSpace(wantId)) wantId = _cfg.current;

            var anim = _cfg.animations.FirstOrDefault(a => a.id == wantId) ?? _cfg.animations[0];
            _mediaPath = Path.Combine(_root, anim.file.Replace('/', Path.DirectorySeparatorChar));

            if (!File.Exists(_mediaPath))
            {
                Fail("找不到视频文件：\n" + _mediaPath);
                return;
            }

            // 尾部循环起点：留最后 3.5 秒当待机
            double total = anim.duration > 0 ? anim.duration : 12;
            _loopFrom = Math.Max(0, total - 3.5);

            Log($"play '{anim.name}' -> {Path.GetFileName(_mediaPath)}");

            Player.Volume = _cfg.volume <= 0 ? 0 : Math.Min(1.0, _cfg.volume);
            Player.Source = new Uri(_mediaPath, UriKind.Absolute);
            Player.Play();

            FadeIn();

            // 动画先起来，250ms 后拉起 Codex，两者并行
            var launchTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(250) };
            launchTimer.Tick += (s, args) =>
            {
                launchTimer.Stop();
                LaunchApp();
            };
            launchTimer.Start();

            _tick = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(300) };
            _tick.Tick += OnTick;
            _tick.Start();

            // 兜底：无论怎样，150 秒内一定收掉
            var hardStop = new DispatcherTimer { Interval = TimeSpan.FromSeconds(150) };
            hardStop.Tick += (s, args) =>
            {
                hardStop.Stop();
                Log("hard stop");
                FinishNow();
            };
            hardStop.Start();

            Activate();
            Focus();
        }

        /* --------------------------- 媒体事件 --------------------------- */

        private void OnMediaOpened(object sender, RoutedEventArgs e)
        {
            Log("media opened");
            FadeIn();
        }

        private void OnMediaEnded(object sender, RoutedEventArgs e)
        {
            _videoDone = true;
            Log("media ended, loop from " + _loopFrom);

            if (_closing) return;

            try
            {
                Player.Position = TimeSpan.FromSeconds(_loopFrom);
                Player.Play();
            }
            catch (Exception ex)
            {
                Log("loop fail: " + ex.Message);
            }
        }

        private void OnMediaFailed(object sender, ExceptionRoutedEventArgs e)
        {
            Fail("视频播放失败：" + e.ErrorException?.Message);
        }

        /* ---------------------------- 状态机 ---------------------------- */

        private void OnTick(object sender, EventArgs e)
        {
            if (_closing) return;

            bool waitOn = _cfg.waitForApp && AppConfigured();

            if (waitOn && !_appReady)
            {
                _appReady = IsAppReady();
                if (_appReady) Log("app ready");
            }

            bool timedOut = (DateTime.Now - _startedAt).TotalMilliseconds > _cfg.maxWaitMs;
            if (timedOut && waitOn && !_appReady && !_closing)
            {
                Log("wait timeout");
            }

            bool shouldClose = waitOn
                ? (_videoDone && _appReady) || timedOut
                : _videoDone;

            if (shouldClose) CloseWithFade(_cfg.fadeOutMs);
        }

        private bool AppConfigured()
        {
            var a = _cfg?.appLaunch;
            return a != null && a.enabled &&
                   ((a.mode == "appsFolder" && !string.IsNullOrWhiteSpace(a.target)) ||
                    !string.IsNullOrWhiteSpace(a.path));
        }

        /// <summary>进程有可见主窗口，才算真的启动完成</summary>
        private bool IsAppReady()
        {
            string proc = _cfg.appLaunch?.processName;
            if (string.IsNullOrWhiteSpace(proc)) proc = "ChatGPT.exe";
            string name = Path.GetFileNameWithoutExtension(proc);

            try
            {
                foreach (var p in Process.GetProcessesByName(name))
                {
                    if (p.MainWindowHandle != IntPtr.Zero) return true;
                }
            }
            catch (Exception ex)
            {
                Log("ready check fail: " + ex.Message);
            }
            return false;
        }

        private void LaunchApp()
        {
            if (_appLaunched) return;
            var a = _cfg.appLaunch;
            if (a == null || !a.enabled) { Log("app launch disabled"); return; }

            _appLaunched = true;
            try
            {
                if (a.mode == "appsFolder" && !string.IsNullOrWhiteSpace(a.target))
                {
                    Process.Start(new ProcessStartInfo("explorer.exe", "shell:AppsFolder\\" + a.target)
                    {
                        UseShellExecute = true
                    });
                    Log("launched appsFolder: " + a.target);
                }
                else if (!string.IsNullOrWhiteSpace(a.path))
                {
                    Process.Start(new ProcessStartInfo(a.path) { UseShellExecute = true });
                    Log("launched exe: " + a.path);
                }
            }
            catch (Exception ex)
            {
                Log("launch fail: " + ex.Message);
            }
        }

        /* ----------------------------- 转场 ----------------------------- */

        private void FadeIn()
        {
            if (_fadedIn) return;
            _fadedIn = true;

            var anim = new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(260))
            {
                EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut }
            };
            BeginAnimation(OpacityProperty, anim);
        }

        private void CloseWithFade(int ms)
        {
            if (_closing) return;
            _closing = true;

            Log("fade out " + ms + "ms");

            if (_tick != null) _tick.Stop();

            var anim = new DoubleAnimation(Opacity, 0, TimeSpan.FromMilliseconds(ms <= 0 ? 400 : ms))
            {
                EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseInOut }
            };
            anim.Completed += (s, e) => FinishNow();
            BeginAnimation(OpacityProperty, anim);
        }

        private void FinishNow()
        {
            try
            {
                Topmost = false;
                Player.Stop();
                Player.Close();
            }
            catch { }
            Application.Current.Shutdown();
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Escape && InputAllowed()) CloseWithFade(260);
        }

        private void Fail(string msg)
        {
            Log("ERROR " + msg);
            ErrText.Text = msg;
            ErrText.Visibility = Visibility.Visible;
            Topmost = false;
            FadeIn();

            var t = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };
            t.Tick += (s, e) => { t.Stop(); FinishNow(); };
            t.Start();
        }

        /* ----------------------------- 工具 ----------------------------- */

        private static string FindRoot()
        {
            var dir = new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory);
            for (int i = 0; i < 6 && dir != null; i++, dir = dir.Parent)
            {
                if (File.Exists(Path.Combine(dir.FullName, "launcher.json")))
                    return dir.FullName;
            }
            return AppDomain.CurrentDomain.BaseDirectory;
        }

        private void Log(string msg)
        {
            try
            {
                var dir = Path.Combine(_root ?? AppDomain.CurrentDomain.BaseDirectory, "logs");
                Directory.CreateDirectory(dir);
                File.AppendAllText(Path.Combine(dir, "splash.log"),
                    $"[{DateTime.Now:HH:mm:ss.fff}] {msg}{Environment.NewLine}");
            }
            catch { }
        }
    }

    /* ------------------------------ 配置模型 ------------------------------ */

    public class AppConfig
    {
        public string current { get; set; }
        public double volume { get; set; } = 1.0;
        public bool waitForApp { get; set; } = true;
        public int maxWaitMs { get; set; } = 60000;
        public int fadeOutMs { get; set; } = 700;
        public LaunchTarget appLaunch { get; set; }
        public List<AnimationItem> animations { get; set; } = new List<AnimationItem>();
    }

    public class LaunchTarget
    {
        public bool enabled { get; set; }
        public string mode { get; set; } = "appsFolder";
        public string target { get; set; }
        public string processName { get; set; } = "ChatGPT.exe";
        public string path { get; set; }
        public List<string> args { get; set; } = new List<string>();
    }

    public class AnimationItem
    {
        public string id { get; set; }
        public string name { get; set; }
        public string desc { get; set; }
        public string file { get; set; }
        public double duration { get; set; }
    }
}
