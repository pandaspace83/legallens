import { Navigate } from 'react-router'
import { currentToken } from '@/api/http/token'

// Where "/" goes. The iPhone app may have restored a sign-in from the Keychain behind Face ID (AS-4.2b, DEC-107):
// then it opens on the matters list, and the session guard sends it back to sign-in if the server session has ended
// (30 minutes idle, 12 hours at most). The web app holds no token, so it always starts at sign-in.
export function StartRoute() {
  return <Navigate to={currentToken() ? '/matters' : '/login'} replace />
}
