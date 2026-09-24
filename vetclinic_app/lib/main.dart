import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'providers/auth_provider.dart';
import 'screens/login_screen.dart';
import 'screens/main_scaffold.dart';
import 'services/push_service.dart';
import 'theme/app_theme.dart';

void main() {
  runApp(const ProviderScope(child: VetClinicApp()));
}

class VetClinicApp extends ConsumerWidget {
  const VetClinicApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);

    ref.listen<AuthState>(authProvider, (_, next) {
      if (next.status == AuthStatus.authenticated) {
        PushService.init((token) {
          ref.read(authProvider.notifier).onNewFcmToken(token);
        });
      }
    });

    return MaterialApp(
      title: 'PawCare',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      home: _buildHome(authState),
    );
  }

  Widget _buildHome(AuthState authState) {
    switch (authState.status) {
      case AuthStatus.loading:
      case AuthStatus.initial:
        return const Scaffold(
          body: Center(child: CircularProgressIndicator()),
        );
      case AuthStatus.authenticated:
        return const MainScaffold();
      case AuthStatus.unauthenticated:
      case AuthStatus.error:
        return const LoginScreen();
    }
  }
}