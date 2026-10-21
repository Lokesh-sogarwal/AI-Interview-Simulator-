import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "./components/shell/AppShell";
import { getCurrentUser } from "@/lib/auth";
import { getUserRole, hasRole } from "@/lib/roles";
import { getDb } from "@/lib/mongodb";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "AI Interview Simulator",
    template: "%s · AI Interview Simulator",
  },
  description:
    "Practice HR, technical and mixed interviews with an AI interviewer, get structured feedback, check your resume and solve coding challenges.",
};

export const viewport: Viewport = {
  themeColor: "#30364F",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  // The admin link reflects the database flag, not just the session token.
  const db = user ? await getDb() : null;
  const role = user && db ? ((await getUserRole(db, user.id)) ?? "user") : "user";
  const isAdmin = hasRole(role, "admin");

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {user ? (
          <AppShell user={{ name: user.name, email: user.email, isAdmin }}>{children}</AppShell>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
