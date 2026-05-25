import { useState, useRef } from "react";
import axios from "axios";
import {
  Label,
  Input,
  Textarea,
  SubsectionHeader,
  YesNoToggle,
  PrefixedInput,
} from "../primitives";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Step1({ form, set }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setUploading(true);
    try {
      const res = await axios.post(`${API}/upload`, fd);
      set("profile_photo_link", res.data.url);
    } catch {
      // silently ignore upload errors
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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

          <div>
            <Label optional>PR / Media Links</Label>
            <Textarea
              testid="ob-pr-media-links"
              rows={3}
              value={form.pr_media_links ?? ""}
              onChange={(e) => set("pr_media_links", e.target.value)}
              placeholder="Paste any press / media links — one per line or comma-separated"
            />
          </div>
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
            <Label>Profile Photo</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              data-testid="ob-profile-photo-file"
              onChange={handlePhotoUpload}
            />
            {form.profile_photo_link ? (
              <div className="flex items-center gap-3">
                <img
                  src={form.profile_photo_link}
                  alt="Profile"
                  className="w-10 h-10 rounded-full object-cover border border-zinc-700"
                />
                <button
                  type="button"
                  onClick={() => set("profile_photo_link", "")}
                  className="text-xs font-mono text-zinc-500 hover:text-red-400 transition-colors"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-testid="ob-profile-photo-upload-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-zinc-500 hover:text-white hover:border-zinc-400 transition-colors duration-150 text-left disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Click to upload photo"}
              </button>
            )}
          </div>

          <div>
            <Label optional>20+ High Quality Photos — Google Drive URL</Label>
            <Input
              testid="ob-high-quality-photos-link"
              type="url"
              value={form.high_quality_photos_link ?? ""}
              onChange={(e) => set("high_quality_photos_link", e.target.value)}
              placeholder="Drive link to 20+ high-quality photos"
            />
          </div>

          <div>
            <Label optional>20+ Video Clips — Google Drive URL</Label>
            <Input
              testid="ob-video-clips-link"
              type="url"
              value={form.video_clips_link ?? ""}
              onChange={(e) => set("video_clips_link", e.target.value)}
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
