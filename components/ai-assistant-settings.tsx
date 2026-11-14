"use client";

import { useEffect, useState } from "react";

type Account = { id: string; username: string };
type Settings = { enabled: boolean; instructions: string; dailyLimit: number; language: "uz-Latn" };
type AccountSettings = Account & { settings: Settings };

export function AiAssistantSettings({ accounts, canManage }: { accounts: Account[]; canManage: boolean }) {
  const [items, setItems] = useState<AccountSettings[]>([]);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ai/settings")
      .then((response) => response.json())
      .then((payload) => {
        if (!payload.success) return;
        setApiKeyConfigured(payload.data.apiKeyConfigured);
        setItems(payload.data.accounts);
      })
      .catch(() => setNotice("AI sozlamalarini yuklab bo‘lmadi."));
  }, []);

  function update(accountId: string, patch: Partial<Settings>) {
    setItems((current) => current.map((item) =>
      item.id === accountId ? { ...item, settings: { ...item.settings, ...patch } } : item,
    ));
  }

  async function save(item: AccountSettings) {
    setBusy(item.id);
    setNotice(null);
    const response = await fetch("/api/ai/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instagramAccountId: item.id, ...item.settings }),
    });
    const payload = await response.json();
    if (payload.success) {
      update(item.id, payload.data);
      setNotice(`@${item.username} sozlamalari saqlandi.`);
    } else {
      setNotice(payload.error ?? "Saqlash amalga oshmadi.");
    }
    setBusy(null);
  }

  return (
    <section className="panel rounded p-4 sm:p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold">AI yordamchi</h2>
        <p className="mt-2 text-sm text-muted">
          Gemini faqat kalit so‘zli kampaniyaga mos kelmagan izoh va DMlarga javob beradi. Izoh javobi hammaga ko‘rinadi.
          AI kaliti serverda saqlanadi va bu sahifada ko‘rsatilmaydi.
        </p>
        <p className="mt-2 text-xs text-muted">
          Bepul Gemini API rejimida so‘rovlar Google xizmatlarini yaxshilash uchun ishlatilishi mumkin. Maxfiy yoki to‘lov ma’lumotlarini yubormang.
          Suhbat jurnallari 30 kundan so‘ng o‘chiriladi.
        </p>
      </div>
      <p className="text-sm">
        Gemini API kaliti: {apiKeyConfigured ? "serverda sozlangan" : "serverda sozlanmagan"}
        {!apiKeyConfigured && <span className="text-muted"> — hosting sozlamalariga GEMINI_API_KEY qo‘shiladi.</span>}
      </p>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted">Avval Instagram professional akkauntini ulang.</p>
      ) : items.length === 0 ? (
        <div className="h-20 rounded bg-surface/70" />
      ) : items.map((item) => (
        <div key={item.id} className="space-y-4 border-t border-border pt-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold">@{item.username}</h3>
              <p className="text-xs text-muted">Gemini 3.8 Flash · O‘zbek lotin</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={item.settings.enabled}
                disabled={!canManage || !apiKeyConfigured}
                onChange={(event) => update(item.id, { enabled: event.target.checked })}
              />
              AI javoblari yoqilgan
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span>Akkaunt haqida ma’lumot va javob qoidalari</span>
            <textarea
              value={item.settings.instructions}
              disabled={!canManage}
              maxLength={4000}
              rows={5}
              placeholder="Masalan: faoliyat yo‘nalishi, narxlar, ish vaqti, havolalar va nimalar haqida javob bermaslik kerak."
              onChange={(event) => update(item.id, { instructions: event.target.value })}
              className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span>Kunlik javob limiti</span>
            <input
              type="number"
              min={1}
              max={500}
              value={item.settings.dailyLimit}
              disabled={!canManage}
              onChange={(event) => update(item.id, { dailyLimit: Number(event.target.value) })}
              className="w-28 rounded border border-border bg-surface px-3 py-2"
            />
          </label>
          <button
            type="button"
            onClick={() => save(item)}
            disabled={!canManage || busy === item.id}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === item.id ? "Saqlanmoqda…" : "Sozlamalarni saqlash"}
          </button>
        </div>
      ))}
      {notice && <p role="status" className="text-sm text-muted">{notice}</p>}
    </section>
  );
}
