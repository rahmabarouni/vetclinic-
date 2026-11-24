import 'package:flutter_test/flutter_test.dart';
import 'package:vetclinic_app/services/api_service.dart';

void main() {
  test('la base REST est configurable au build', () {
    final api = ApiService(baseUrl: 'https://api.example.test');
    expect(api.baseUrl, 'https://api.example.test');
  });

  test('la base WebSocket suit le schéma HTTP/HTTPS', () {
    expect(
      ApiService.wsUrlFor('https://api.example.test'),
      'wss://api.example.test',
    );
    expect(
      ApiService.wsUrlFor('http://10.0.2.2:3000'),
      'ws://10.0.2.2:3000',
    );
  });

  test('sans dart-define, le fallback de développement reste disponible', () {
    expect(ApiService.configuredBaseUrl, isNotEmpty);
    expect(ApiService.wsBaseUrl, startsWith('ws://'));
  });
}
