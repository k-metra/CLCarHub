import { Link } from "react-router-dom";
import { AdminShell } from "../components/AdminShell";

export default function AdminPlaceholderPage({ title }: { title: string }) {
  return (
    <AdminShell title={title}>
      <div className="mt-8 border border-black/10 bg-white p-8">
        <p className="text-sm text-[#777]">
          This workspace is ready to connect to the corresponding Laravel API
          module.
        </p>
        <Link
          className="mt-5 inline-block text-sm font-semibold text-[#ff641f]"
          to="/admin"
        >
          Return to overview →
        </Link>
      </div>
    </AdminShell>
  );
}
