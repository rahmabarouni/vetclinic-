/// Abstraction de la messagerie push.
///
/// Bloqué tant qu'un projet Firebase n'est pas configuré côté app :
/// ajouter `firebase_core` + `firebase_messaging` dans pubspec.yaml, créer le
/// fichier android/app/google-services.json fourni par la console Firebase,
/// puis récupérer le token (FirebaseMessaging.instance.getToken) et rappeler
/// `onToken` à chaque changement.
class PushService {
  /// Initialise le service et fournit le token FCM du téléphone quand il est
  /// disponible. Tant que Firebase n'est pas configuré, retourne null (pas
  /// d'envoi au serveur).
  static Future<String?> init(void Function(String token) onToken) async {
    return null;
  }
}