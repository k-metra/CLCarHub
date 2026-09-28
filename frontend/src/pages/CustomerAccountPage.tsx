import { Link, Navigate } from "react-router-dom";
import { useAuth, useSignOut } from "../lib/AuthContext";

export default function CustomerAccountPage() {
  const { user, loading } = useAuth();
  const signOut = useSignOut();
  if (loading) return null;
  if (!user) return <Navigate to="/admin/login" replace />;
  return (
    <div className="min-h-screen bg-[#f4f3f0] p-8 text-[#151515]">
      <div className="mx-auto max-w-[900px]">
        <header className="flex items-center justify-between">
          <Link className="font-['Space_Grotesk'] text-xl font-bold" to="/">
            CL<span className="text-[#ff641f]">CarHub</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span>
              {user.name} ({user.email})
            </span>
            <button className="text-[#ff641f]" onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>
        <div className="mt-16 border border-black/10 bg-white p-8">
          <p className="text-[10px] font-bold uppercase tracking-[2.7px] text-[#ff641f]">
            CUSTOMER ACCOUNT
          </p>
          <h1 className="mt-3 font-['Space_Grotesk'] text-4xl font-semibold">
            Your trips.
          </h1>
          <p className="mt-3 text-sm text-[#777]">
            Your verified customer account is ready. Booking history and
            upcoming rentals will appear here.
          </p>
          <Link
            className="mt-6 inline-block bg-[#ff641f] px-5 py-3 text-sm font-bold text-white"
            to="/"
          >
            Browse vehicles →
          </Link>
        </div>
      </div>
    </div>
  );
}
