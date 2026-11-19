from pathlib import Path

root = Path(r"D:\VoiceupOnline-ReleaseCandidates\CampaignOS-Development-Preview-20261104")
target = root / "src/components/SupporterAccountClaimPanel.tsx"

original = target.read_text(encoding="utf-8")
content = original

def replace_once(old, new):
    global content
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"STOP: Expected 1 match, found {count}: {old[:60]!r}")
    content = content.replace(old, new, 1)

replace_once(
    "  registerSupporterWithEmailForContext,",
    "  registerSupporterWithEmailForContext,\n  verifySupporterSignupOtp,"
)

replace_once(
    'type ClaimAuthMode = "register" | "sign_in";',
    'type ClaimAuthMode = "register" | "sign_in" | "verify_signup_otp";'
)

replace_once(
    '  const [password, setPassword] = useState("");',
    '  const [password, setPassword] = useState("");\n  const [signupOtp, setSignupOtp] = useState("");'
)

replace_once(
    '      setAuthMode("sign_in");\n      setMessage(copy.registrationSent);',
    '      setAuthMode("verify_signup_otp");\n       setSignupOtp("");\n      setMessage("Enter the verification code sent to your email.");'
)

replace_once(
    "  const linkCurrentIdentity = async () => {",
    """  const verifySignupOtpAndLink = async () => {
    setBusy(true);
    setIsError(false);
    setMessage("Verifying your email code...");
    try {
      const verified = await verifySupporterSignupOtp(email, signupOtp);
      setIdentity(verified);
      setSignupOtp("");
      await linkForIdentity(verified.email);
    } catch (error) {
      setIsError(true);
      setMessage(safeMessage(error, copy));
    } finally {
      setBusy(false);
    }
  };

  const linkCurrentIdentity = async () => {"""
)

replace_once(
    "      {identity ? (",
    """      {authMode === "verify_signup_otp" && !linked ? (
        <div className="public-supporter-account-form" aria-busy={busy}>
          <p>Enter the verification code sent to <strong>{signingEmail}</strong>.</p>
          <label htmlFor="supporter-signup-otp">Email verification code</label>
          <input
            id="supporter-signup-otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            value={signupOtp}
            disabled={busy}
            onChange={(event) => setSignupOtp(event.target.value.replace(/\\D/g, ""))}
          />
          <div className="public-post-sign-actions">
            <button className="primary-button" type="button" disabled={busy || !/^\\d{6,10}$/.test(signupOtp)} onClick={() => void verifySignupOtpAndLink()}>
              Verify & Continue
            </button>
          </div>
        </div>
      ) : identity ? ("""
)

print("PATCH VALIDATION PASS: All six replacements matched exactly once.")
print("Application files unchanged.")

