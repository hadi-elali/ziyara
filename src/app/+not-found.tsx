import { Redirect } from 'expo-router';

/** Keep unmatched links inside the app's authenticated root navigator. */
export default function UnmatchedScreen() {
  return <Redirect href="/" />;
}
