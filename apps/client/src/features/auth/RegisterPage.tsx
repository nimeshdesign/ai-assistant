import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { registerSchema, type RegisterInput } from '@aia/shared';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form-controls';
import { errorCode, errorMessage, fieldErrors } from '@/store/api';
import { useRegisterMutation } from '@/store/authApi';
import { AuthLayout } from './AuthLayout';
import { PasswordInput, PasswordRules } from './PasswordInput';
import { safeNext } from './guards';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [registerUser, { isLoading }] = useRegisterMutation();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
    mode: 'onTouched',
  });
  const password = watch('password');

  const onSubmit = async (values: RegisterInput) => {
    setFormError(undefined);
    try {
      await registerUser(values).unwrap();
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      if (errorCode(err) === 'CONFLICT') {
        setError('email', { message: 'An account with this email already exists' });
        return;
      }
      const fields = fieldErrors(err);
      for (const [path, message] of Object.entries(fields)) {
        if (path === 'name' || path === 'email' || path === 'password') setError(path, { message });
      }
      if (!Object.keys(fields).length) setFormError(errorMessage(err, 'Could not create your account.'));
    }
  };

  return (
    <AuthLayout title="Create your account" description="Free, private, and you can delete it any time.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-text">
            {formError}
          </p>
        )}
        <Field label="Full name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" autoComplete="name" autoFocus aria-invalid={!!errors.name} {...register('name')} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby="password-rules"
            {...register('password')}
          />
          <PasswordRules id="password-rules" value={password} />
        </Field>
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="animate-spin" />}
          {isLoading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to={`/login${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
