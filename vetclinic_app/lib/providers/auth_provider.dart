import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/user.dart';
import '../services/api_service.dart';

final apiServiceProvider = Provider<ApiService>((ref) {
  return ApiService();
});

enum AuthStatus { initial, loading, authenticated, unauthenticated, error }

class AuthState {
  final AuthStatus status;
  final User? user;
  final String? error;

  AuthState({
    this.status = AuthStatus.initial,
    this.user,
    this.error,
  });

  AuthState copyWith({
    AuthStatus? status,
    User? user,
    String? error,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: user ?? this.user,
      error: error ?? this.error,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  final ApiService _api;

  AuthNotifier(this._api) : super(AuthState()) {
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    final token = await _api.token;
    if (token != null) {
      state = state.copyWith(status: AuthStatus.authenticated);
    } else {
      state = state.copyWith(status: AuthStatus.unauthenticated);
    }
  }

  Future<void> login(String email, String password) async {
    state = state.copyWith(status: AuthStatus.loading, error: null);
    try {
      final data = await _api.login(email, password);
      final user = User.fromJson(data['user'] as Map<String, dynamic>);
      state = state.copyWith(status: AuthStatus.authenticated, user: user);
    } catch (e) {
      String message = 'Erreur de connexion';
      if (e.toString().contains('401')) {
        message = 'Email ou mot de passe incorrect';
      } else if (e.toString().contains('429')) {
        message = 'Trop de tentatives. Réessayez dans 1 minute.';
      } else if (e.toString().contains('SocketException') ||
          e.toString().contains('Connection refused')) {
        message = 'Impossible de se connecter au serveur';
      }
      state = state.copyWith(status: AuthStatus.error, error: message);
    }
  }

  Future<void> register({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
    bool privacyConsent = true,
  }) async {
    state = state.copyWith(status: AuthStatus.loading, error: null);
    try {
      final data = await _api.register(
        email: email,
        password: password,
        firstName: firstName,
        lastName: lastName,
        privacyConsent: privacyConsent,
      );
      final user = User.fromJson(data['user'] as Map<String, dynamic>);
      state = state.copyWith(status: AuthStatus.authenticated, user: user);
    } catch (e) {
      String message = "Erreur d'inscription";
      if (e.toString().contains('409')) {
        message = 'Email déjà utilisé';
      } else if (e.toString().contains('400')) {
        message = 'Vous devez accepter les conditions et le consentement RGPD';
      }
      state = state.copyWith(status: AuthStatus.error, error: message);
    }
  }

  Future<void> loginWithGoogle({required String idToken}) async {
    state = state.copyWith(status: AuthStatus.loading, error: null);
    try {
      final data = await _api.loginWithGoogle(idToken: idToken);
      final user = User.fromJson(data['user'] as Map<String, dynamic>);
      state = state.copyWith(status: AuthStatus.authenticated, user: user);
    } catch (e) {
      String message = 'Connexion Google impossible';
      if (e.toString().contains('401')) {
        message = 'Connexion Google refusée';
      } else if (e.toString().contains('403')) {
        message = 'Cet email est déjà utilisé avec un compte classique';
      } else if (e.toString().contains('429')) {
        message = 'Trop de tentatives. Réessayez dans 1 minute.';
      } else if (e.toString().contains('SocketException') ||
          e.toString().contains('Connection refused')) {
        message = 'Impossible de se connecter au serveur';
      }
      state = state.copyWith(status: AuthStatus.error, error: message);
    }
  }

  Future<void> logout() async {
    await _api.logout();
    state = AuthState(status: AuthStatus.unauthenticated);
  }

  Future<void> updateProfile({
    String? firstName,
    String? lastName,
    String? phone,
    String? address,
  }) async {
    try {
      final data = await _api.updateProfile(
        firstName: firstName,
        lastName: lastName,
        phone: phone,
        address: address,
      );
      final user = User.fromJson(data['user'] as Map<String, dynamic>);
      state = state.copyWith(user: user, error: null);
    } catch (e) {
      state = state.copyWith(error: 'Mise à jour du profil impossible');
    }
  }

  Future<void> onNewFcmToken(String? token) async {
    if (token == null || token.isEmpty) return;
    try {
      await _api.registerFcmToken(token);
    } catch (_) {}
  }

  Future<String?> verifyEmail({
    required String email,
    required String code,
  }) async {
    try {
      await _api.verifyEmail(email: email, code: code);
      return null;
    } catch (e) {
      return _mapVerificationError(e);
    }
  }

  Future<String?> resendVerification({required String email}) async {
    try {
      await _api.resendVerification(email: email);
      return null;
    } catch (e) {
      return _mapVerificationError(e);
    }
  }

  String _mapVerificationError(Object e) {
    final message = e.toString();
    if (message.contains('400')) return 'Code invalide ou email déjà vérifié';
    if (message.contains('401')) return 'Session expirée, reconnectez-vous';
    if (message.contains('404')) return 'Utilisateur introuvable';
    if (message.contains('429')) return 'Trop de demandes, patientez un instant';
    if (message.contains('SocketException') ||
        message.contains('Connection refused')) {
      return 'Impossible de se connecter au serveur';
    }
    return 'Erreur de vérification';
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.watch(apiServiceProvider));
});
