using System.Collections.Concurrent;
using Godot;
using MegaCrit.Sts2.Core.Localization.Fonts;
using MegaCrit.Sts2.Core.Nodes.Cards.Holders;
using MegaCrit.Sts2.Core.Nodes.Screens.CardSelection;

namespace GameBuddyBridge.Scripts;

internal static class GameBuddyRewardOverlay
{
    private sealed record ImpactLabel(PanelContainer Panel, float AnchorX);

    private static readonly ConcurrentQueue<DraftImpactMessage> Pending = new();
    private static readonly Dictionary<NCardHolder, ImpactLabel> Labels = new();
    private static readonly float[] ThreeCardAnchorXs = [0.315f, 0.492f, 0.678f];
    private const string ChineseGlyphProbe = "自动打击消耗引擎力量叠加格挡壁垒";
    private static NCardRewardSelectionScreen? _screen;
    private static string _signature = string.Empty;
    private static HashSet<string> _candidateIds = new(StringComparer.OrdinalIgnoreCase);

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

        if (_screen is null) return;
        var viewport = _screen.GetViewport().GetVisibleRect();
        foreach (var (holder, impactLabel) in Labels)
        {
            var panel = impactLabel.Panel;
            if (!GodotObject.IsInstanceValid(holder) || !GodotObject.IsInstanceValid(panel)) continue;
            var width = Math.Max(240f, viewport.Size.X * 0.16f);
            var height = Math.Max(112f, viewport.Size.Y * 0.14f);
            panel.Size = new Vector2(width, height);
            panel.GlobalPosition = new Vector2(
                viewport.Position.X + viewport.Size.X * impactLabel.AnchorX - width / 2,
                viewport.Position.Y + viewport.Size.Y * 0.35f - height / 2);
            panel.Visible = holder.IsVisibleInTree();
        }
    }

    private static void ShowImpacts(Node screen, IReadOnlyDictionary<string, DraftCardImpact> impacts)
    {
        ClearLabels();
        var holders = FindHolders(screen, 0)
            .Where(holder => holder.CardModel?.Id.Entry is string cardId && _candidateIds.Contains(cardId))
            .OrderBy(holder => holder.GetGlobalRect().Position.X)
            .ToArray();
        for (var index = 0; index < holders.Length; index++)
        {
            var holder = holders[index];
            var cardId = holder.CardModel?.Id.Entry;
            if (cardId is null || !impacts.TryGetValue(cardId, out var impact)) continue;
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
                BgColor = new Color(0.141f, 0.110f, 0.086f, 0.94f),
                BorderColor = new Color(0.431f, 0.294f, 0.165f),
                BorderWidthLeft = 1,
                BorderWidthTop = 2,
                BorderWidthRight = 1,
                BorderWidthBottom = 1,
                CornerRadiusTopLeft = 2,
                CornerRadiusTopRight = 2,
                CornerRadiusBottomLeft = 2,
                CornerRadiusBottomRight = 2,
                ContentMarginLeft = 8,
                ContentMarginRight = 8,
                ContentMarginTop = 6,
                ContentMarginBottom = 6
            });
            var rows = new VBoxContainer
            {
                MouseFilter = Control.MouseFilterEnum.Ignore,
                FocusMode = Control.FocusModeEnum.None
            };
            rows.AddThemeConstantOverride("separation", 0);
            var rowLabels = impact.Archetypes.Select(archetype => CreateRow(archetype, true)).ToArray();
            foreach (var label in rowLabels) rows.AddChild(label);
            frame.AddChild(rows);
            screen.AddChild(frame);
            // 用户标注的是屏幕上的固定三格；只用卡牌坐标决定左右顺序，不用它定位文字。
            var anchorX = holders.Length == 3
                ? ThreeCardAnchorXs[index]
                : 0.5f + (index - (holders.Length - 1) / 2f) * 0.18f;
            Labels[holder] = new ImpactLabel(frame, anchorX);
            var useChinese = true;
            try
            {
                foreach (var label in rowLabels)
                    FontControlUtils.ApplyLocaleFontSubstitution(label, FontType.Regular, "font");
                useChinese = rowLabels.All(label =>
                    ChineseGlyphProbe.All(character => label.GetThemeFont("font").HasChar(character)));
            }
            catch
            {
                useChinese = false;
            }
            for (var rowIndex = 0; rowIndex < rowLabels.Length; rowIndex++)
                rowLabels[rowIndex].Text = GameBuddyRewardImpactCodec.FormatLine(
                    impact.Archetypes[rowIndex], useChinese);
        }
    }

    private static Label CreateRow(DraftArchetypeImpact impact, bool useChinese)
    {
        var label = new Label
        {
            Name = $"Impact_{impact.Id}",
            Text = GameBuddyRewardImpactCodec.FormatLine(impact, useChinese),
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            MouseFilter = Control.MouseFilterEnum.Ignore,
            FocusMode = Control.FocusModeEnum.None
        };
        label.AddThemeFontSizeOverride("font_size", 16);
        label.AddThemeColorOverride("font_color", impact.DeltaPoints switch
        {
            > 0 => new Color(0.878f, 0.631f, 0.353f),
            < 0 => new Color(0.769f, 0.518f, 0.455f),
            _ => new Color(0.553f, 0.510f, 0.463f)
        });
        label.AddThemeColorOverride("font_outline_color", new Color(0.08f, 0.06f, 0.04f));
        label.AddThemeConstantOverride("outline_size", 1);
        return label;
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
        foreach (var impactLabel in Labels.Values)
        {
            var panel = impactLabel.Panel;
            if (GodotObject.IsInstanceValid(panel)) panel.QueueFree();
        }
        Labels.Clear();
    }
}
