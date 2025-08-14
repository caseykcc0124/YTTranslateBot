import { Link } from "wouter";
import RecentTranslations from "@/components/recent-translations";

export default function Management() {
  return (
    <div className="font-sans bg-gray-50 min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/">
                <a className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
                  <i className="fab fa-youtube text-red-600 text-2xl"></i>
                  <h1 className="text-xl font-bold text-gray-900">
                    翻譯字幕平台
                  </h1>
                </a>
              </Link>
            </div>
            <nav className="flex space-x-8">
              <Link href="/">
                <a className="text-gray-700 hover:text-gray-900 font-medium">首頁</a>
              </Link>
              <Link href="/management">
                <a className="text-blue-600 hover:text-blue-800 font-medium">翻譯清單</a>
              </Link>
              <Link href="/cache">
                <a className="text-gray-700 hover:text-gray-900 font-medium">快取管理</a>
              </Link>
              <Link href="/settings">
                <a className="text-gray-700 hover:text-gray-900 font-medium">系統設定</a>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <RecentTranslations onVideoSelect={(videoId) => {
          // Navigate to home page with selected video
          window.location.href = `/?video=${videoId}`;
        }} />
      </main>
    </div>
  );
}