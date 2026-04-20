"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"

export default function SetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : ""
    const hashParams = new URLSearchParams(hash)
    const accessToken = hashParams.get("access_token")
    const refreshToken = hashParams.get("refresh_token")

    const loadSession = async () => {
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (error) {
          setSessionError(error.message)
          return
        }
        if (window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname)
        }
      }

      const { data, error } = await supabase.auth.getSession()
      if (error) {
        setSessionError(error.message)
        return
      }
      if (!data.session) {
        setSessionError(
          "This link is invalid or expired. Request a new invite/reset link."
        )
        setHasSession(false)
        return
      }
      setSessionError(null)
      setHasSession(true)
    }

    void loadSession()
  }, [])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }
    if (password !== confirm) {
      setError("Passwords do not match")
      return
    }
    if (!hasSession) {
      setError("Auth session missing")
      return
    }

    setPending(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setPending(false)
      return
    }

    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 px-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Set your password</h1>
          <p className="text-sm text-muted-foreground">
            Choose a password to finish setting up your account.
          </p>
          {sessionError && (
            <p className="text-sm text-destructive">{sessionError}</p>
          )}
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={pending || !!sessionError}
          >
            {pending ? "Saving…" : "Set password"}
          </Button>
        </form>
      </div>
    </div>
  )
}
