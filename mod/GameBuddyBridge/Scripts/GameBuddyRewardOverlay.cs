using System.Collections.Concurrent;
using Godot;
using MegaCrit.Sts2.Core.Localization.Fonts;
using MegaCrit.Sts2.Core.Nodes.Cards.Holders;
using MegaCrit.Sts2.Core.Nodes.Screens.CardSelection;

namespace GameBuddyBridge.Scripts;

internal static class GameBuddyRewardOverlay
{
    private sealed class HoverLink
    {
        public required NCardHolder Holder { get; init; }
        public required string CardId { get; init; }
        public Control Target { get; set; } = null!;
        public void Enter() => SetHovered(CardId);
        public void Exit() => ClearHovered(CardId);
    }

    private sealed class ScoreRow
    {
        public required string Id { get; init; }
        public required string Name { get; init; }
        public required Label NameLabel { get; init; }
        public required Label ScoreLabel { get; init; }
        public required Label DeltaLabel { get; init; }
        public required ColorRect Track { get; init; }
        public required ColorRect Fill { get; init; }
        public int ShownScore { get; set; }
        public bool Leader { get; set; }
    }

    private static readonly ConcurrentQueue<DraftImpactMessage> Pending = new();
    private static readonly List<HoverLink> Links = new();
    private static readonly List<ScoreRow> Rows = new();
    private static readonly string[] Names = ["自动打击流", "消耗引擎", "力量叠加", "格挡壁垒"];
    private static readonly Color Iron = new(0.141f, 0.110f, 0.086f, 0.94f);
    private static readonly Color Copper = new(0.431f, 0.294f, 0.165f);
    private static readonly Color CopperLine = new(0.769f, 0.478f, 0.227f);
    private static readonly Color Cream = new(0.945f, 0.918f, 0.863f);
    private static readonly Color Muted = new(0.718f, 0.667f, 0.608f);
    private static readonly Color TrackColor = new(0.227f, 0.192f, 0.157f);
    private static readonly Color Bar = new(0.647f, 0.420f, 0.235f);
    private static readonly Color BarLeader = new(0.878f, 0.631f, 0.353f);
    private static readonly Color DeltaUp = new(0.878f, 0.631f, 0.353f);
    private static readonly Color DeltaDown = new(0.769f, 0.518f, 0.455f);

    private static NCardRewardSelectionScreen? _screen;
    private static PanelContainer? _panel;
    private static Label? _stateLabel;
    private static readonly List<Label> _labels = new();
    private static string _signature = string.Empty;
    private static string? _hoveredCardId;
    private static HashSet<string> _candidateIds = new(StringComparer.OrdinalIgnoreCase);
    private static IReadOnlyDictionary<string, DraftCardImpact>? _impacts;
    private static NCardHolder[] _holders = [];

    public static void TrackScreen(NCardRewardSelectionScreen screen)
    {
        ClearLabels();
        _screen = screen;
        _signature = string.Empty;
        _candidateIds.Clear();
    }

    public static void SetOffer(NCardRewardSelectionScreen screen, string signature, IEnumerable<string> candidateIds)
    {
        if (!ReferenceEquals(_screen, screen)) TrackScreen(screen);
        if (string.Equals(_signature, signature, StringComparison.Ordinal)) return;
        ClearLabels();
        _signature = signature;
        _candidateIds = new HashSet<string>(candidateIds, StringComparer.OrdinalIgnoreCase);
    }

    public static void ClearScreen(NCardRewardSelectionScreen screen)
    {
        if (!ReferenceEquals(_screen, screen)) return;
        ClearLabels();
        _screen = null;
        _signature = string.Empty;
        _candidateIds.Clear();
    }

    public static void QueueImpactMessage(string json)
    {
        if (GameBuddyRewardImpactCodec.TryParse(json, out var message) && message is not null)
            Pending.Enqueue(message);
    }

    public static void ProcessFrame()
    {
        if (_screen is not null && (!GodotObject.IsInstanceValid(_screen) || !_screen.IsInsideTree()))
        {
            ClearLabels();
            _screen = null;
            _signature = string.Empty;
            _candidateIds.Clear();
        }

        while (Pending.TryDequeue(out var message))
        {
            if (_screen is null || !string.Equals(message.Signature, _signature, StringComparison.Ordinal)) continue;
            if (message.Impacts.Keys.Any(cardId => !_candidateIds.Contains(cardId))) continue;
            ShowImpacts(_screen, message.Impacts);
        }

        if (_panel is null || !GodotObject.IsInstanceValid(_panel) || _holders.Length == 0) return;
        var alive = _holders.Where(holder => GodotObject.IsInstanceValid(holder)).ToArray();
        if (alive.Length == 0) return;
        var rects = alive.Select(holder => holder.GetGlobalRect()).ToArray();
        var width = 360f;
        var height = Math.Max(_panel.GetCombinedMinimumSize().Y, 176f);
        _panel.Size = new Vector2(width, height);
        var centerX = rects.Average(rect => rect.GetCenter().X);
        var viewport = alive[0].GetViewport().GetVisibleRect();
        var x = centerX - width / 2f;
        var y = viewport.Position.Y + 18f;
        _panel.GlobalPosition = new Vector2(x, y);
        _panel.Visible = alive.Any(holder => holder.IsVisibleInTree());
        UpdateHoveredFromMouse(alive);
        foreach (var row in Rows)
        {
            var trackWidth = row.Track.Size.X;
            if (trackWidth <= 0f) continue;
            var ratio = Math.Clamp(row.ShownScore / 100f, 0f, 1f);
            row.Fill.Size = new Vector2(trackWidth * ratio, Math.Max(4f, row.Track.Size.Y));
            row.Fill.Color = row.Leader ? BarLeader : Bar;
        }
    }

    private static void UpdateHoveredFromMouse(NCardHolder[] holders)
    {
        string? focused = null;
        string? geometric = null;
        foreach (var holder in holders)
        {
            var cardId = holder.CardModel?.Id.Entry;
            if (cardId is null) continue;
            var hitbox = holder.Hitbox;
            if (hitbox is not null && GodotObject.IsInstanceValid(hitbox))
            {
                if (hitbox.HasFocus()) focused = cardId;
                if (ContainsMouse(hitbox)) geometric = cardId;
            }
            if (holder.CardNode is Control cardNode && ContainsMouse(cardNode)) geometric = cardId;
        }
        var hit = focused ?? geometric;
        if (string.Equals(_hoveredCardId, hit, StringComparison.OrdinalIgnoreCase)) return;
        _hoveredCardId = hit;
        RefreshRows();
    }

    private static bool ContainsMouse(Control control)
    {
        if (!GodotObject.IsInstanceValid(control) || !control.IsVisibleInTree()) return false;
        return control.GetGlobalRect().Grow(24f).HasPoint(control.GetGlobalMousePosition());
    }

    private static void SetHovered(string cardId)
    {
        if (string.Equals(_hoveredCardId, cardId, StringComparison.OrdinalIgnoreCase)) return;
        _hoveredCardId = cardId;
        RefreshRows();
    }

    private static void ClearHovered(string cardId)
    {
        if (!string.Equals(_hoveredCardId, cardId, StringComparison.OrdinalIgnoreCase)) return;
        _hoveredCardId = null;
        RefreshRows();
    }

    private static void ShowImpacts(Node screen, IReadOnlyDictionary<string, DraftCardImpact> impacts)
    {
        ClearLabels();
        _impacts = impacts;
        _holders = FindHolders(screen, 0)
            .Where(holder => holder.CardModel?.Id.Entry is string cardId && _candidateIds.Contains(cardId))
            .OrderBy(holder => holder.GetGlobalRect().Position.X)
            .ToArray();
        _panel = CreatePanel();
        screen.AddChild(_panel);
        foreach (var holder in _holders)
        {
            var cardId = holder.CardModel?.Id.Entry;
            if (cardId is null) continue;
            var link = new HoverLink { Holder = holder, CardId = cardId };
            var target = holder.Hitbox is Control hitbox && GodotObject.IsInstanceValid(hitbox) ? hitbox : holder;
            target.MouseEntered += link.Enter;
            target.MouseExited += link.Exit;
            link.Target = target;
            Links.Add(link);
        }
        RefreshRows();
        ApplyFonts();
    }

    private static PanelContainer CreatePanel()
    {
        var frame = new PanelContainer
        {
            Name = "GameBuddyArchetypeImpact",
            MouseFilter = Control.MouseFilterEnum.Ignore,
            FocusMode = Control.FocusModeEnum.None,
            ZIndex = 100,
            TopLevel = true
        };
        frame.AddThemeStyleboxOverride("panel", new StyleBoxFlat
        {
            BgColor = Iron,
            BorderColor = Copper,
            BorderWidthLeft = 1,
            BorderWidthRight = 1,
            BorderWidthBottom = 1,
            BorderWidthTop = 2,
            ContentMarginLeft = 14,
            ContentMarginRight = 14,
            ContentMarginTop = 10,
            ContentMarginBottom = 10
        });

        var body = new VBoxContainer
        {
            MouseFilter = Control.MouseFilterEnum.Ignore,
            FocusMode = Control.FocusModeEnum.None
        };
        body.AddThemeConstantOverride("separation", 6);
        var head = new HBoxContainer { MouseFilter = Control.MouseFilterEnum.Ignore };
        var title = MakeLabel("铁甲构筑进度", 15, Cream);
        _stateLabel = MakeLabel("尚未启动", 12, Muted);
        _stateLabel.SizeFlagsHorizontal = Control.SizeFlags.ExpandFill;
        _stateLabel.HorizontalAlignment = HorizontalAlignment.Right;
        head.AddChild(title);
        head.AddChild(_stateLabel);
        body.AddChild(head);
        var rule = new ColorRect
        {
            Color = CopperLine,
            CustomMinimumSize = new Vector2(0, 2),
            MouseFilter = Control.MouseFilterEnum.Ignore
        };
        body.AddChild(rule);

        for (var index = 0; index < GameBuddyRewardImpactCodec.ArchetypeIds.Length; index++)
        {
            var id = GameBuddyRewardImpactCodec.ArchetypeIds[index];
            var line = new HBoxContainer { MouseFilter = Control.MouseFilterEnum.Ignore };
            line.AddThemeConstantOverride("separation", 8);
            var name = MakeLabel(Names[index], 15, Muted);
            name.CustomMinimumSize = new Vector2(96, 0);
            var track = new ColorRect
            {
                Color = TrackColor,
                CustomMinimumSize = new Vector2(108, 8),
                SizeFlagsHorizontal = Control.SizeFlags.ExpandFill,
                MouseFilter = Control.MouseFilterEnum.Ignore
            };
            var fill = new ColorRect
            {
                Color = Bar,
                MouseFilter = Control.MouseFilterEnum.Ignore
            };
            track.AddChild(fill);
            var score = MakeLabel("0", 16, Cream);
            var delta = MakeLabel(string.Empty, 16, DeltaUp);
            line.AddChild(name);
            line.AddChild(track);
            line.AddChild(score);
            line.AddChild(delta);
            body.AddChild(line);
            Rows.Add(new ScoreRow
            {
                Id = id,
                Name = Names[index],
                NameLabel = name,
                ScoreLabel = score,
                DeltaLabel = delta,
                Track = track,
                Fill = fill
            });
        }

        var note = MakeLabel("构筑点不是胜率", 11, new Color(0.553f, 0.510f, 0.463f));
        note.HorizontalAlignment = HorizontalAlignment.Right;
        body.AddChild(note);
        frame.AddChild(body);
        return frame;
    }

    private static Label MakeLabel(string text, int size, Color color)
    {
        var label = new Label
        {
            Text = text,
            MouseFilter = Control.MouseFilterEnum.Ignore,
            FocusMode = Control.FocusModeEnum.None,
            AutowrapMode = TextServer.AutowrapMode.Off,
            ClipText = false
        };
        _labels.Add(label);
        label.AddThemeFontSizeOverride("font_size", size);
        label.AddThemeColorOverride("font_color", color);
        label.AddThemeColorOverride("font_outline_color", new Color(0.08f, 0.06f, 0.04f));
        label.AddThemeConstantOverride("outline_size", 1);
        return label;
    }

    private static void RefreshRows()
    {
        DraftCardImpact? hovered = null;
        if (_hoveredCardId is not null && _impacts is not null)
            _impacts.TryGetValue(_hoveredCardId, out hovered);
        var baseline = _impacts?.Values.FirstOrDefault();
        var scores = GameBuddyRewardImpactCodec.ArchetypeIds.Select(id => ScoreOf(baseline, id)).ToArray();
        var stages = GameBuddyRewardImpactCodec.ArchetypeIds.Select(id => StageOf(baseline, id)).ToArray();
        var highestStage = stages.Length == 0 ? 0 : stages.Max(StageRank);
        var highest = scores.Select((score, index) => (score, index))
            .Where(item => StageRank(stages[item.index]) == highestStage)
            .Select(item => item.score)
            .DefaultIfEmpty(0)
            .Max();
        var leaders = scores.Select((score, index) => (score, index))
            .Where(item => highestStage > 0
                && StageRank(stages[item.index]) == highestStage
                && item.score == highest)
            .ToArray();
        if (_stateLabel is not null)
        {
            _stateLabel.Text = leaders.Length switch
            {
                0 => "尚未启动",
                1 => $"主流派 · {Names[leaders[0].index]} · {StageLabel(stages[leaders[0].index])}",
                _ => "混合构筑"
            };
            _stateLabel.AddThemeColorOverride("font_color", leaders.Length == 1 ? BarLeader : leaders.Length > 1 ? DeltaUp : Muted);
        }

        for (var index = 0; index < Rows.Count; index++)
        {
            var row = Rows[index];
            var before = ScoreOf(baseline, row.Id);
            var hoveredImpact = hovered?.Archetypes.FirstOrDefault(item => item.Id == row.Id);
            var delta = hoveredImpact?.DeltaPoints ?? 0;
            var after = hoveredImpact?.AfterScore ?? before;
            var shownStage = hoveredImpact?.AfterStage ?? StageOf(baseline, row.Id);
            var transition = StageRank(hoveredImpact?.AfterStage) > StageRank(hoveredImpact?.BeforeStage)
                ? StageLabel(hoveredImpact?.AfterStage)
                : string.Empty;
            row.ShownScore = after;
            row.Leader = leaders.Any(item => item.index == index);
            row.NameLabel.Text = $"{row.Name} · {StageLabel(shownStage)}";
            row.ScoreLabel.Text = hoveredImpact is null ? before.ToString() : $"{before}→{after}";
            row.DeltaLabel.Text = !string.IsNullOrEmpty(transition)
                ? $" {transition}"
                : delta == 0 ? string.Empty : " " + GameBuddyRewardImpactCodec.FormatSignedDelta(delta);
            row.DeltaLabel.AddThemeColorOverride("font_color", delta > 0 ? DeltaUp : DeltaDown);
            var nameColor = row.Leader ? Cream : Muted;
            var scoreColor = row.Leader ? BarLeader : Cream;
            row.NameLabel.AddThemeColorOverride("font_color", nameColor);
            row.ScoreLabel.AddThemeColorOverride("font_color", scoreColor);
        }
    }

    private static int ScoreOf(DraftCardImpact? impact, string id) =>
        impact?.Archetypes.FirstOrDefault(item => item.Id == id)?.BeforeScore ?? 0;

    private static string StageOf(DraftCardImpact? impact, string id) =>
        impact?.Archetypes.FirstOrDefault(item => item.Id == id)?.BeforeStage ?? "unformed";

    private static int StageRank(string? stage) => stage switch
    {
        "formed" => 2,
        "started" => 1,
        _ => 0
    };

    private static string StageLabel(string? stage) => stage switch
    {
        "formed" => "已成型",
        "started" => "已启动",
        _ => "未启动"
    };

    private static void ApplyFonts()
    {
        try
        {
            foreach (var label in _labels)
                FontControlUtils.ApplyLocaleFontSubstitution(label, FontType.Regular, "font");
        }
        catch
        {
            // 字体替换失败时沿用面板默认字体。
        }
    }

    private static IEnumerable<NCardHolder> FindHolders(Node node, int depth)
    {
        if (depth > 15) yield break;
        foreach (var child in node.GetChildren())
        {
            if (child is NCardHolder holder && holder.CardModel is not null)
            {
                yield return holder;
                continue;
            }
            if (child is Node childNode)
            {
                foreach (var nestedHolder in FindHolders(childNode, depth + 1)) yield return nestedHolder;
            }
        }
    }

    private static void ClearLabels()
    {
        foreach (var link in Links)
        {
            if (!GodotObject.IsInstanceValid(link.Target)) continue;
            link.Target.MouseEntered -= link.Enter;
            link.Target.MouseExited -= link.Exit;
        }
        Links.Clear();
        Rows.Clear();
        _labels.Clear();
        _hoveredCardId = null;
        _impacts = null;
        _holders = [];
        _stateLabel = null;
        if (_panel is not null && GodotObject.IsInstanceValid(_panel)) _panel.QueueFree();
        _panel = null;
    }
}
