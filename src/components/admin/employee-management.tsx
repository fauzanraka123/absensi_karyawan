"use client";

import { useState, type FormEvent } from "react";

type Branch = {
  id: number;
  name: string;
};

export type ManagedEmployee = {
  id: number;
  username: string;
  name: string;
  branchId: number;
  branchName: string;
};

type EmployeeManagementProps = {
  branches: Branch[];
  employees: ManagedEmployee[];
};

type EmployeeForm = {
  id: number | null;
  username: string;
  name: string;
  pin: string;
  branchId: string;
};

const emptyForm: EmployeeForm = {
  id: null,
  username: "",
  name: "",
  pin: "",
  branchId: "",
};

export function EmployeeManagement({
  branches,
  employees: initialEmployees,
}: EmployeeManagementProps) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [form, setForm] = useState<EmployeeForm>({
    ...emptyForm,
    branchId: String(branches[0]?.id ?? ""),
  });
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function startEditing(employee: ManagedEmployee) {
    setForm({
      id: employee.id,
      username: employee.username,
      name: employee.name,
      pin: "",
      branchId: String(employee.branchId),
    });
    setError("");
    setNotice("");
  }

  function resetForm() {
    setForm({ ...emptyForm, branchId: String(branches[0]?.id ?? "") });
  }

  async function saveEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setNotice("");

    const editing = form.id !== null;
    try {
      const response = await fetch("/api/admin/employees", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editing ? { id: form.id } : {}),
          username: form.username,
          name: form.name,
          pin: form.pin,
          branchId: Number(form.branchId),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        employee?: ManagedEmployee;
      };
      if (!response.ok || !result.employee) {
        throw new Error(result.error ?? "Data karyawan tidak dapat disimpan.");
      }

      const employee = result.employee;
      setEmployees((current) =>
        editing
          ? current.map((item) => (item.id === employee.id ? employee : item))
          : [...current, employee].sort((left, right) =>
              left.name.localeCompare(right.name, "id"),
            ),
      );
      resetForm();
      setNotice(editing ? "Data karyawan berhasil diperbarui." : "Akun karyawan berhasil dibuat.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Data karyawan tidak dapat disimpan.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteEmployee(employee: ManagedEmployee) {
    if (!window.confirm(`Hapus akun ${employee.username}? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }

    setDeletingId(employee.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/employees", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: employee.id }),
      });
      const result = (await response.json()) as { deleted?: boolean; error?: string };
      if (!response.ok || !result.deleted) {
        throw new Error(result.error ?? "Akun karyawan tidak dapat dihapus.");
      }
      setEmployees((current) => current.filter((item) => item.id !== employee.id));
      if (form.id === employee.id) resetForm();
      setNotice("Akun karyawan berhasil dihapus.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Akun karyawan tidak dapat dihapus.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
      <div>
        <p className="text-sm font-semibold text-emerald-800">MANAJEMEN AKUN</p>
        <h2 className="mt-2 text-2xl font-semibold text-neutral-900">
          Data karyawan
        </h2>
        <p className="mt-2 text-sm text-neutral-600">
          Hanya admin yang dapat membuat akun dan mengatur username, PIN awal,
          serta cabang penugasan.
        </p>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          {notice}
        </p>
      )}

      <form
        className="mt-5 grid gap-4 rounded-xl bg-neutral-50 p-4 sm:grid-cols-2 sm:p-5"
        onSubmit={saveEmployee}
      >
        <h3 className="text-lg font-semibold text-neutral-900 sm:col-span-2">
          {form.id === null ? "Buat akun karyawan" : `Ubah akun: ${form.username}`}
        </h3>
        <label className="block text-sm font-medium text-neutral-700">
          Username
          <input
            autoComplete="off"
            className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3"
            maxLength={32}
            minLength={3}
            onChange={(event) =>
              setForm((current) => ({ ...current, username: event.target.value }))
            }
            pattern="[A-Za-z0-9_.-]+"
            required
            type="text"
            value={form.username}
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700">
          Nama karyawan
          <input
            className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3"
            maxLength={150}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            required
            type="text"
            value={form.name}
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700">
          {form.id === null ? "PIN awal" : "PIN baru (kosongkan jika tidak diubah)"}
          <input
            autoComplete="new-password"
            className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3"
            maxLength={16}
            minLength={4}
            onChange={(event) =>
              setForm((current) => ({ ...current, pin: event.target.value }))
            }
            required={form.id === null}
            type="password"
            value={form.pin}
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700">
          Cabang penugasan
          <select
            className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3"
            onChange={(event) =>
              setForm((current) => ({ ...current, branchId: event.target.value }))
            }
            required
            value={form.branchId}
          >
            <option disabled value="">
              Pilih cabang
            </option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <button
            className="min-h-11 rounded-lg bg-emerald-800 px-5 font-semibold text-white hover:bg-emerald-900 disabled:opacity-50"
            disabled={isSaving || deletingId !== null || branches.length === 0}
            type="submit"
          >
            {isSaving ? "Menyimpan..." : form.id === null ? "Buat akun" : "Simpan perubahan"}
          </button>
          {form.id !== null && (
            <button
              className="min-h-11 rounded-lg border border-neutral-300 px-5 font-semibold text-neutral-700 hover:bg-white"
              onClick={resetForm}
              type="button"
            >
              Batal
            </button>
          )}
        </div>
      </form>

      {employees.length === 0 ? (
        <p className="mt-5 rounded-xl bg-neutral-50 p-5 text-sm text-neutral-600">
          Belum ada akun karyawan.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-neutral-600">
                <th className="px-3 py-3 font-medium">Nama</th>
                <th className="px-3 py-3 font-medium">Username</th>
                <th className="px-3 py-3 font-medium">Cabang</th>
                <th className="px-3 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td className="px-3 py-3 font-medium text-neutral-900">
                    {employee.name}
                  </td>
                  <td className="px-3 py-3 text-neutral-700">{employee.username}</td>
                  <td className="px-3 py-3 text-neutral-700">{employee.branchName}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        className="rounded-md border border-neutral-300 px-3 py-2 font-medium hover:bg-neutral-50"
                        disabled={isSaving || deletingId !== null}
                        onClick={() => startEditing(employee)}
                        type="button"
                      >
                        Ubah
                      </button>
                      <button
                        className="rounded-md border border-red-200 px-3 py-2 font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
                        disabled={isSaving || deletingId !== null}
                        onClick={() => void deleteEmployee(employee)}
                        type="button"
                      >
                        {deletingId === employee.id ? "Menghapus..." : "Hapus"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
