import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/auth_provider.dart';
import '../theme/app_theme.dart';

class EmailVerificationScreen extends ConsumerStatefulWidget {
  final String email;

  const EmailVerificationScreen({super.key, required this.email});

  @override
  ConsumerState<EmailVerificationScreen> createState() =>
      _EmailVerificationScreenState();
}

class _EmailVerificationScreenState extends ConsumerState<EmailVerificationScreen> {
  final _codeController = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final code = _codeController.text.trim();
    if (code.length != 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Saisissez le code à 6 caractères'), backgroundColor: Colors.red),
      );
      return;
    }

    setState(() => _submitting = true);
    final error = await ref
        .read(authProvider.notifier)
        .verifyEmail(email: widget.email, code: code);
    if (!mounted) return;
    setState(() => _submitting = false);

    if (error == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Email vérifié avec succès !')),
      );
      Navigator.pop(context, true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error), backgroundColor: Colors.red),
      );
    }
  }

  Future<void> _resend() async {
    setState(() => _submitting = true);
    final error = await ref
        .read(authProvider.notifier)
        .resendVerification(email: widget.email);
    if (!mounted) return;
    setState(() => _submitting = false);

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(error ?? 'Code de vérification renvoyé'),
        backgroundColor: error == null ? Colors.green : Colors.red,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Vérification email')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(Icons.mark_email_read_outlined, size: 72, color: AppColors.primary),
            const SizedBox(height: 24),
            const Text(
              'Vérifiez votre adresse email',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              "Un code à 6 caractères a été envoyé à\n${widget.email}",
              style: const TextStyle(fontSize: 14, color: Colors.grey),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            TextField(
              controller: _codeController,
              keyboardType: TextInputType.text,
              textCapitalization: TextCapitalization.characters,
              maxLength: 6,
              decoration: const InputDecoration(
                labelText: 'Code de vérification',
                prefixIcon: Icon(Icons.pin),
                border: OutlineInputBorder(),
                counterText: '',
              ),
              onSubmitted: (_) => _verify(),
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 48,
              child: ElevatedButton(
                onPressed: _submitting ? null : _verify,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                ),
                child: _submitting
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('Vérifier'),
              ),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: _submitting ? null : _resend,
              child: const Text('Renvoyer le code'),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: _submitting ? null : () => Navigator.pop(context),
              child: const Text('Plus tard', style: TextStyle(color: Colors.grey)),
            ),
          ],
        ),
      ),
    );
  }
}