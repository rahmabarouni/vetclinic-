import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'local_notifications.dart';

/// Abstraction de la messagerie push.
///
/// Initialise Firebase Messaging, demande la permission, puis fournit le token
/// FCM du téléphone à `onToken`. Abonné aussi aux changements de token
/// (rotation par Firebase). Le reste du plumbing (envoi du token vers
/// `PUT /api/v1/fcm-token`) est câblé dans `main.dart` et `auth_provider.dart`.
class PushService {
  static bool _foregroundHandlerBound = false;

  /// Initialise le service et fournit le token FCM du téléphone quand il est
  /// disponible. Retourne null si la permission est refusée ou indisponible.
  static Future<String?> init(void Function(String token) onToken) async {
    await Firebase.initializeApp();
    final messaging = FirebaseMessaging.instance;

    final settings = await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      return null;
    }

    // Les notifications reçues au premier plan ne sont pas affichées par l'OS :
    // on les reproduit via une notification locale.
    if (!_foregroundHandlerBound) {
      await LocalNotifications.init();
      FirebaseMessaging.onMessage.listen(LocalNotifications.showFromRemoteMessage);
      _foregroundHandlerBound = true;
    }

    final token = await messaging.getToken();
    if (token != null) {
      onToken(token);
    }
    messaging.onTokenRefresh.listen(onToken);
    return token;
  }
}