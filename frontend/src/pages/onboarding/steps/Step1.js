import {
  Label,
  Input,
  MultiInput,
  SubsectionHeader,
  YesNoToggle,
  PrefixedInput,
} from "../primitives";

export default function Step1({ form, set }) {
  return (
    <div className="space-y-8">
      {/* ── 1A — Personal & Contact Details ─────────────────────────── */}
      <div>
        <SubsectionHeader id="1A" label="Personal & Contact Details" />

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Full Name</Label>
              <Input
                testid="ob-name"
                type="text"
                value={form.name ?? ""}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Rahul Sharma"
              />
            </div>
            <div>
              <Label>Brand Name</Label>
              <Input
                testid="ob-brand-name"
                type="text"
                value={form.brand_name ?? ""}
                onChange={(e) => set("brand_name", e.target.value)}
                placeholder="FitWithRahul"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Email</Label>
              <Input
                testid="ob-email"
                type="email"
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
                placeholder="rahul@gmail.com"
              />
            </div>
            <div>
              <Label>WhatsApp</Label>
              <Input
                testid="ob-whatsapp"
                type="tel"
                value={form.whatsapp ?? ""}
                onChange={(e) => set("whatsapp", e.target.value)}
                placeholder="+91 98000 00000"
              />
            </div>
          </div>

          <div>
            <Label>City, Country</Label>
            <Input
              testid="ob-city-country"
              type="text"
              value={form.city_country ?? ""}
              onChange={(e) => set("city_country", e.target.value)}
              placeholder="Mumbai, India"
            />
          </div>
        </div>
      </div>

      {/* ── 1B — Social Media & Online Presence ─────────────────────── */}
      <div>
        <SubsectionHeader id="1B" label="Social Media & Online Presence" />

        <div className="space-y-4">
          <div>
            <Label>Instagram Handle</Label>
            <PrefixedInput
              prefix="@"
              testid="ob-instagram-handle"
              value={form.instagram_handle ?? ""}
              onChange={(e) => set("instagram_handle", e.target.value)}
              placeholder="rahulsharma"
            />
          </div>

          <div>
            <Label>Instagram Profile URL</Label>
            <Input
              testid="ob-instagram-profile-url"
              type="url"
              value={form.instagram_profile_url ?? ""}
              onChange={(e) => set("instagram_profile_url", e.target.value)}
              placeholder="instagram.com/rahulsharma"
            />
          </div>

          <div>
            <Label>Instagram Password</Label>
            <Input
              testid="ob-instagram-password"
              type="password"
              autoComplete="new-password"
              value={form.instagram_password ?? ""}
              onChange={(e) => set("instagram_password", e.target.value)}
              placeholder="We need this to re-verify your account for management"
            />
            <p className="text-[10px] text-zinc-600 font-mono mt-1.5">
              Stored as a string for account re-verification. Keep this account secure.
            </p>
          </div>

          <div>
            <Label>Website URL</Label>
            <Input
              testid="ob-website-url"
              type="url"
              value={form.website_url ?? ""}
              onChange={(e) => set("website_url", e.target.value)}
              placeholder="www.rahulsharma.com"
            />
          </div>

          <div>
            <Label>LinkedIn URL</Label>
            <Input
              testid="ob-linkedin-url"
              type="url"
              value={form.linkedin_url ?? ""}
              onChange={(e) => set("linkedin_url", e.target.value)}
              placeholder="linkedin.com/in/rahulsharma"
            />
          </div>

          <div>
            <Label>YouTube URL</Label>
            <Input
              testid="ob-youtube-url"
              type="url"
              value={form.youtube_url ?? ""}
              onChange={(e) => set("youtube_url", e.target.value)}
              placeholder="Paste link or write NA"
            />
          </div>

          <div>
            <Label>Twitter / X URL</Label>
            <Input
              testid="ob-twitter-url"
              type="url"
              value={form.twitter_url ?? ""}
              onChange={(e) => set("twitter_url", e.target.value)}
              placeholder="Paste link or write NA"
            />
          </div>

          <MultiInput
            label="PR / Media Links"
            values={Array.isArray(form.pr_links) && form.pr_links.length ? form.pr_links : [""]}
            onChange={(v) => set("pr_links", v)}
            placeholder="https://..."
            testid="ob-pr"
          />
        </div>
      </div>

      {/* ── 1C — Assets Upload ──────────────────────────────────────── */}
      <div>
        <SubsectionHeader
          id="1C"
          label="Assets Upload"
          hint="Use Google Drive — share with view access."
        />

        <div className="space-y-4">
          <div>
            <Label>Profile Photo (Drive Link)</Label>
            <Input
              testid="ob-profile-photo-link"
              type="url"
              value={form.profile_photo_link ?? ""}
              onChange={(e) => set("profile_photo_link", e.target.value)}
              placeholder="Drive link to 1:1 close-up profile photo"
            />
          </div>

          <div>
            <Label>Logo (Drive Link)</Label>
            <Input
              testid="ob-logo-link"
              type="url"
              value={form.logo_link ?? ""}
              onChange={(e) => set("logo_link", e.target.value)}
              placeholder="Drive link to logo PNG (transparent bg)"
            />
          </div>

          <div>
            <Label>Photo Library (Drive Link)</Label>
            <Input
              testid="ob-google-drive-images"
              type="url"
              value={form.google_drive_images ?? ""}
              onChange={(e) => set("google_drive_images", e.target.value)}
              placeholder="Drive link to 20+ high-quality photos"
            />
          </div>

          <div>
            <Label>Video Clips (Drive Link)</Label>
            <Input
              testid="ob-google-drive-videos"
              type="url"
              value={form.google_drive_videos ?? ""}
              onChange={(e) => set("google_drive_videos", e.target.value)}
              placeholder="Drive link to 20+ short video clips"
            />
          </div>
        </div>
      </div>

      {/* ── 1D — Instagram Account Health Check ─────────────────────── */}
      <div>
        <SubsectionHeader id="1D" label="Instagram Account Health" />

        <div className="space-y-4">
          <YesNoToggle
            label="Has the account been suspended, shadowbanned, or seen a sudden reach drop?"
            value={form.account_suspended ?? false}
            onChange={(v) => set("account_suspended", v)}
            testid="ob-suspended"
          />
          <YesNoToggle
            label="Have you run paid ads from this Instagram account?"
            value={form.paid_ads_run ?? false}
            onChange={(v) => set("paid_ads_run", v)}
            testid="ob-paid-ads"
          />
        </div>
      </div>
    </div>
  );
}
