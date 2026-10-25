import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import {
  APP_ROLES,
  DEPARTMENTS,
  GENDERS,
  departmentLabel,
  genderLabel,
  roleLabel,
  type AppRole,
  type Employee,
  type Gender,
} from "@/lib/employees";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/employees")({
  head: () => ({
    meta: [
      { title: "Employees — Ladies Collections" },
      { name: "description", content: "Add staff and grant access for Ladies Collections." },
    ],
  }),
  component: EmployeesPage,
});

type Draft = {
  fullName: string;
  email: string;
  password: string;
  mobile: string;
  department: string;
  gender: Gender | "";
  address: string;
  role: AppRole;
};

const emptyDraft: Draft = {
  fullName: "",
  email: "",
  password: "",
  mobile: "",
  department: "",
  gender: "",
  address: "",
  role: "staff",
};

function EmployeesPage() {
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<Employee | "new" | null>(null);
  const [passwordFor, setPasswordFor] = useState<Employee | null>(null);

  const employees = useQuery({
    queryKey: ["employees"],
    retry: false,
    queryFn: () => apiFetch<{ employees: Employee[] }>("/api/employees"),
  });

  const denied = employees.error instanceof Error && employees.error.message.includes("admin");

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Employees</h1>
          <p className="mt-2 text-sm text-muted-foreground">Add staff and choose who can manage the shop.</p>
        </div>
        {!denied && (
          <Button className="rounded-full" onClick={() => setEditor("new")}>
            Add employee
          </Button>
        )}
      </div>

      {employees.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : denied ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <h2 className="text-2xl font-semibold">Admins only</h2>
          <p className="mt-2 text-sm text-muted-foreground">Ask the shop owner to grant access changes.</p>
        </div>
      ) : employees.error ? (
        <p className="text-sm text-destructive">{employees.error.message}</p>
      ) : employees.data?.employees.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <h2 className="text-2xl font-semibold">No staff yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Add the first employee. They sign in with the email and password you set here.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Access</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.data?.employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell>
                    <div className="font-medium">{employee.fullName}</div>
                    <div className="text-xs text-muted-foreground">{employee.email}</div>
                  </TableCell>
                  <TableCell>{departmentLabel(employee.department)}</TableCell>
                  <TableCell>{employee.mobile || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={employee.role === "admin" ? "default" : "secondary"}>{roleLabel(employee.role)}</Badge>
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditor(employee)}>
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => setPasswordFor(employee)}>
                      Password
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <EmployeeDialog
        open={editor !== null}
        employee={editor === "new" ? null : editor}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        onSaved={() => {
          setEditor(null);
          void queryClient.invalidateQueries({ queryKey: ["employees"] });
        }}
      />
      <PasswordDialog
        employee={passwordFor}
        onOpenChange={(open) => {
          if (!open) setPasswordFor(null);
        }}
      />
    </div>
  );
}

function EmployeeDialog({
  open,
  employee,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  employee: Employee | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  useEffect(() => {
    if (!open) return;
    setDraft(
      employee
        ? {
            fullName: employee.fullName,
            email: employee.email,
            password: "",
            mobile: employee.mobile ?? "",
            department: employee.department,
            gender: employee.gender === "MALE" || employee.gender === "FEMALE" ? employee.gender : "",
            address: employee.address ?? "",
            role: employee.role,
          }
        : emptyDraft,
    );
  }, [open, employee]);

  const save = useMutation({
    mutationFn: async () => {
      if (!draft.department) throw new Error("Choose a department.");
      const department = draft.department;
      if (employee) {
        await apiFetch(`/api/employees/${employee.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            fullName: draft.fullName,
            mobile: draft.mobile,
            department,
            gender: draft.gender,
            address: draft.address,
            role: draft.role,
          }),
        });
        return;
      }
      await apiFetch("/api/employees", {
        method: "POST",
        body: JSON.stringify({ ...draft, department }),
      });
    },
    onSuccess: () => {
      toast.success(employee ? "Employee updated." : "Employee added.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const departmentOptions =
    draft.department && !(DEPARTMENTS as readonly string[]).includes(draft.department)
      ? [draft.department, ...DEPARTMENTS]
      : DEPARTMENTS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{employee ? "Edit employee" : "Add employee"}</DialogTitle>
          <DialogDescription>
            {employee
              ? "Update the job and access. Email stays the sign-in name."
              : "They sign in with this email and password."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Full name" id="fullName">
            <Input
              id="fullName"
              value={draft.fullName}
              onChange={(event) => setDraft({ ...draft, fullName: event.target.value })}
              required
              maxLength={80}
            />
          </Field>
          <Field label="Email" id="email">
            <Input
              id="email"
              type="email"
              value={draft.email}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              required
              disabled={!!employee}
            />
          </Field>
          {!employee && (
            <Field label="Password" id="password">
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={draft.password}
                onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">At least 10 characters with letters and numbers. Never a phone number.</p>
            </Field>
          )}
          <Field label="Mobile" id="mobile">
            <Input
              id="mobile"
              value={draft.mobile}
              onChange={(event) => setDraft({ ...draft, mobile: event.target.value })}
              maxLength={20}
            />
          </Field>
          <Field label="Department" id="department">
            <Select
              value={draft.department || undefined}
              onValueChange={(value) => setDraft({ ...draft, department: value })}
            >
              <SelectTrigger id="department">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {departmentOptions.map((department) => (
                  <SelectItem key={department} value={department}>
                    {departmentLabel(department)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Gender" id="gender">
            <Select
              value={draft.gender || "unset"}
              onValueChange={(value) => setDraft({ ...draft, gender: value === "unset" ? "" : (value as Gender) })}
            >
              <SelectTrigger id="gender">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Not set</SelectItem>
                {GENDERS.map((gender) => (
                  <SelectItem key={gender} value={gender}>
                    {genderLabel(gender)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Address" id="address">
            <Textarea
              id="address"
              value={draft.address}
              onChange={(event) => setDraft({ ...draft, address: event.target.value })}
              maxLength={300}
            />
          </Field>
          <Field label="Access" id="role">
            <Select value={draft.role} onValueChange={(value) => setDraft({ ...draft, role: value as AppRole })}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APP_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {roleLabel(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button type="submit" className="rounded-full" disabled={save.isPending}>
              {save.isPending ? "Saving…" : employee ? "Save" : "Add employee"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({ employee, onOpenChange }: { employee: Employee | null; onOpenChange: (open: boolean) => void }) {
  const [password, setPassword] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      if (!employee) return;
      await apiFetch(`/api/employees/${employee.id}/password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
    },
    onSuccess: () => {
      toast.success("Password updated.");
      setPassword("");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog
      open={!!employee}
      onOpenChange={(open) => {
        if (!open) setPassword("");
        onOpenChange(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set a new password</DialogTitle>
          <DialogDescription>{employee ? `For ${employee.fullName}.` : ""}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <Field label="New password" id="new-password">
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">At least 10 characters with letters and numbers. Never a phone number.</p>
          </Field>
          <DialogFooter>
            <Button type="submit" className="rounded-full" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Update password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
