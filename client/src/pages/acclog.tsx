
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function AccLogPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ pathname: "/", search: "?tab=logs" }, { replace: true });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Dang chuyen toi bang dieu khien acc log...</p>
    </div>
  );
}
