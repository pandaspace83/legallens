import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/api/ApiProvider'
import { queryKeys } from '@/api/queryKeys'

// Endpoint group A: sign in, MFA and the signed-in user.
export function useMe() {
  const api = useApi()
  return useQuery({ queryKey: queryKeys.me, queryFn: () => api.getMe(), staleTime: Infinity })
}

/** Saves the licensing states on the server and refreshes the signed-in user (INT-3.10). */
export function useUpdateLicensingStates() {
  const api = useApi()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (states: string[]) => api.updateLicensingStates(states),
    onSuccess: (user) => client.setQueryData(queryKeys.me, user),
  })
}

export function useSignIn() {
  const api = useApi()
  return useMutation({
    mutationFn: (v: { email: string; password: string }) => api.signIn(v.email, v.password),
  })
}

export function useVerifyMfa() {
  const api = useApi()
  return useMutation({ mutationFn: (code: string) => api.verifyMfa(code) })
}

/** Records the lawyer's agreement to send text to the AI company, and refreshes the signed-in user (AS-3.5). */
export function useAcceptAiConsent() {
  const api = useApi()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (version: string) => api.acceptAiConsent(version),
    onSuccess: (user) => client.setQueryData(queryKeys.me, user),
  })
}

/** Ends the session on the server and forgets what this browser loaded. The caller navigates to the sign-in page. */
export function useSignOut() {
  const api = useApi()
  const client = useQueryClient()
  return async () => {
    try {
      await api.signOut()
    } catch {
      // The server could not be reached: the token is gone from this device either way.
    }
    client.clear()
  }
}
