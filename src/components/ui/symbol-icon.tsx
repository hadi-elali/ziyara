import { SymbolView } from 'expo-symbols';
import { Text } from 'react-native';
import type { ColorValue } from 'react-native';

export type SymbolIconName =
  | 'account'
  | 'alarm'
  | 'book'
  | 'bookmark'
  | 'bus'
  | 'chevron'
  | 'close'
  | 'confirm'
  | 'copy'
  | 'decline'
  | 'external-link'
  | 'globe'
  | 'home'
  | 'info'
  | 'location'
  | 'logout'
  | 'map'
  | 'minus'
  | 'people'
  | 'plus'
  | 'question'
  | 'refresh'
  | 'search'
  | 'settings'
  | 'share'
  | 'unchecked'
  | 'warning';

const symbolNames: Record<SymbolIconName, React.ComponentProps<typeof SymbolView>['name']> = {
  account: { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' },
  alarm: {
    ios: 'bell.and.waves.left.and.right.fill',
    android: 'notifications_active',
    web: 'notifications_active',
  },
  book: { ios: 'book.closed', android: 'menu_book', web: 'menu_book' },
  bookmark: { ios: 'bookmark', android: 'bookmark', web: 'bookmark' },
  bus: { ios: 'bus.fill', android: 'directions_bus', web: 'directions_bus' },
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  confirm: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  copy: { ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' },
  decline: { ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' },
  'external-link': { ios: 'arrow.up.forward.square', android: 'open_in_new', web: 'open_in_new' },
  globe: { ios: 'globe', android: 'language', web: 'language' },
  home: { ios: 'house', android: 'home', web: 'home' },
  info: { ios: 'info.circle', android: 'info', web: 'info' },
  location: { ios: 'location.fill', android: 'navigation', web: 'navigation' },
  logout: {
    ios: 'rectangle.portrait.and.arrow.right',
    android: 'logout',
    web: 'logout',
  },
  map: { ios: 'map', android: 'map', web: 'map' },
  minus: { ios: 'minus', android: 'remove', web: 'remove' },
  people: { ios: 'person.3', android: 'group', web: 'group' },
  plus: { ios: 'plus', android: 'add', web: 'add' },
  question: { ios: 'questionmark.bubble', android: 'help', web: 'help' },
  refresh: { ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  share: { ios: 'square.and.arrow.up', android: 'share', web: 'share' },
  unchecked: { ios: 'circle', android: 'radio_button_unchecked', web: 'radio_button_unchecked' },
  warning: { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' },
};

export function SymbolIcon({
  color,
  name,
  size = 20,
}: {
  color: ColorValue;
  name: SymbolIconName;
  size?: number;
}) {
  return (
    <SymbolView
      fallback={<Text style={{ color, fontSize: size }}>#</Text>}
      name={symbolNames[name]}
      size={size}
      tintColor={color}
    />
  );
}
