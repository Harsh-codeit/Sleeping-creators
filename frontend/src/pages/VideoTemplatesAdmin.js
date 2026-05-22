import { useUser } from "../context/UserContext";

export default function VideoTemplatesAdmin() {
  const { role, permissions } = useUser();
  const vp = role === "owner" ? { view: true, create: true, edit: true, delete: true }
    : (permissions?.video_templates ?? { view: true, create: true, edit: true, delete: true });

  return (
    <div className="p-6" data-testid="video-templates-page">
      <h1 className="text-xl font-bold text-white">Video Templates</h1>
    </div>
  );
}
