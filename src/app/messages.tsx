import { Redirect } from 'expo-router'

// Alias: /messages is a stable, shareable URL for the conversations screen, which
// actually lives at /requests. A direct hit or bookmark on /messages used to 404 —
// now it redirects to the same screen instead.
export default function MessagesRedirect() {
  return <Redirect href="/requests" />
}
