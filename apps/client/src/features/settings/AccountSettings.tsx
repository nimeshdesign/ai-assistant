import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { KeyRound, Laptop, Loader2, LogOut, Smartphone, Trash2 } from 'lucide-react';
import { changePasswordSchema, type ChangePasswordInput } from '@aia/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/form-controls';
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/common/states';
import { PasswordInput, PasswordRules } from '@/features/auth/PasswordInput';
import { useAppSelector } from '@/store';
import { errorMessage, fieldErrors } from '@/store/api';
import {
  useChangePasswordMutation,
  useDeleteAccountMutation,
  useGetSessionsQuery,
  useLogoutMutation,
  useRevokeSessionMutation,
} from '@/store/authApi';
import { timeAgo } from '@/lib/format';

export function AccountSettings() {
  const user = useAppSelector((s) => s.auth.user);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>You sign in with this email address.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="font-medium">{user?.email}</p>
          {user && <p className="text-muted-foreground">Member since {new Date(user.createdAt).toLocaleDateString()}</p>}
        </CardContent>
      </Card>
      <ChangePasswordCard />
      <DevicesCard />
      <DeleteAccountCard />
    </div>
  );
}

function ChangePasswordCard() {
  const [changePassword] = useChangePasswordMutation();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const onSubmit = async (values: ChangePasswordInput) => {
    try {
      const { otherSessionsSignedOut } = await changePassword(values).unwrap();
      reset();
      toast.success(
        otherSessionsSignedOut > 0
          ? `Password changed. Signed out ${otherSessionsSignedOut} other device${otherSessionsSignedOut === 1 ? '' : 's'}.`
          : 'Password changed.',
      );
    } catch (err) {
      const fields = fieldErrors(err);
      if (fields.currentPassword) setError('currentPassword', { message: fields.currentPassword });
      else if (fields.newPassword) setError('newPassword', { message: fields.newPassword });
      else toast.error(errorMessage(err, 'Could not change your password.'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" /> Change password
        </CardTitle>
        <CardDescription>Other devices are signed out when you change it.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Field label="Current password" htmlFor="currentPassword" error={errors.currentPassword?.message}>
            <PasswordInput id="currentPassword" autoComplete="current-password" aria-invalid={!!errors.currentPassword} {...register('currentPassword')} />
          </Field>
          <Field label="New password" htmlFor="newPassword" error={errors.newPassword?.message}>
            <PasswordInput
              id="newPassword"
              autoComplete="new-password"
              aria-invalid={!!errors.newPassword}
              aria-describedby="new-password-rules"
              {...register('newPassword')}
            />
            <PasswordRules id="new-password-rules" value={watch('newPassword')} />
          </Field>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />} Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Rough, human-friendly device label from a user-agent string. */
export function describeDevice(ua: string) {
  if (!ua) return { label: 'Unknown device', mobile: false };
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /Electron\//.test(ua) ? 'Desktop app' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return { label: os ? `${browser} on ${os}` : browser, mobile: /Mobile|Android|iPhone/.test(ua) };
}

function DevicesCard() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useGetSessionsQuery();
  const [revoke] = useRevokeSessionMutation();
  const [logout] = useLogoutMutation();
  const [confirmAll, setConfirmAll] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signed-in devices</CardTitle>
        <CardDescription>Sign out of devices you don't recognise.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : isError || !data ? (
          <ErrorState onRetry={refetch} />
        ) : (
          <ul className="divide-y rounded-lg border" aria-label="Signed-in devices">
            {data.map((s) => {
              const device = describeDevice(s.userAgent);
              const Icon = device.mobile ? Smartphone : Laptop;
              return (
                <li key={s.id} className="flex items-center gap-3 p-3">
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {device.label} {s.current && <Badge variant="success">This device</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">Active {timeAgo(s.lastUsedAt)}</p>
                  </div>
                  {!s.current && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Sign out ${device.label}`}
                      onClick={async () => {
                        try {
                          await revoke(s.id).unwrap();
                          toast.success('Device signed out');
                        } catch (err) {
                          toast.error(errorMessage(err));
                        }
                      }}
                    >
                      Sign out
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Button variant="outline" onClick={() => setConfirmAll(true)}>
          <LogOut /> Sign out everywhere
        </Button>
      </CardContent>
      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title="Sign out of all devices?"
        description="You will be signed out here too and need to sign in again on every device."
        confirmLabel="Sign out everywhere"
        onConfirm={async () => {
          await logout({ everywhere: true });
          toast.success('Signed out of all devices');
          navigate('/login', { replace: true });
        }}
      />
    </Card>
  );
}

function DeleteAccountCard() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [deleteAccount, { isLoading }] = useDeleteAccountMutation();

  const confirm = async () => {
    if (!password) {
      setError('Enter your password to confirm');
      return;
    }
    try {
      await deleteAccount({ password }).unwrap();
      toast.success('Your account and all its data were deleted.');
      navigate('/register', { replace: true });
    } catch (err) {
      setError(fieldErrors(err).password ?? errorMessage(err));
    }
  };

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>
          Permanently deletes your account, profile, settings, history, mock interviews and reports. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" className="text-destructive-text" onClick={() => setOpen(true)}>
          <Trash2 /> Delete my account
        </Button>
      </CardContent>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setPassword('');
            setError(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>All of your data is removed immediately. Enter your password to confirm.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void confirm();
            }}
            className="space-y-4"
          >
            <Field label="Password" htmlFor="delete-password" error={error}>
              <PasswordInput
                id="delete-password"
                autoComplete="current-password"
                value={password}
                aria-invalid={!!error}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(undefined);
                }}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={isLoading}>
                {isLoading && <Loader2 className="animate-spin" />} Delete account permanently
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
