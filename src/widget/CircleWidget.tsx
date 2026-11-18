import { FlexWidget, TextWidget } from 'react-native-android-widget';

export type WidgetPerson = { name: string; emoji: string; where: string; ago: string; battery: string };

export function CircleWidget({ circle, people, dark }: { circle: string; people: WidgetPerson[]; dark: boolean }) {
  const bg = dark ? '#161922' : '#FFFFFF';
  const text = dark ? '#F4F5F8' : '#0B0D12';
  const sub = dark ? '#9298A8' : '#6B7080';
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: bg, borderRadius: 24, padding: 14, flexDirection: 'column' }}>
      <TextWidget text={`◉ ${circle}`} style={{ fontSize: 13, color: '#5B7CFA', fontWeight: '700', marginBottom: 6 }} />
      {people.length === 0 ? (
        <TextWidget text="Open Orbit to load your circle" style={{ fontSize: 13, color: sub }} />
      ) : (
        people.slice(0, 4).map((p, i) => (
          <FlexWidget key={i} style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', marginTop: 4 }}>
            <TextWidget text={p.emoji} style={{ fontSize: 18, marginRight: 8 }} />
            <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
              <TextWidget text={p.name} style={{ fontSize: 14, color: text, fontWeight: '600' }} />
              <TextWidget text={`${p.where} · ${p.ago}`} style={{ fontSize: 11, color: sub }} maxLines={1} />
            </FlexWidget>
            <TextWidget text={p.battery} style={{ fontSize: 11, color: sub }} />
          </FlexWidget>
        ))
      )}
    </FlexWidget>
  );
}
