import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiService {
  final Dio _dio;
  final FlutterSecureStorage _storage;

  static const String _tokenKey = 'jwt_token';

  static const String defaultBaseUrl = 'http://10.0.2.2:3000';

  ApiService({String? baseUrl})
      : _dio = Dio(BaseOptions(
          baseUrl: baseUrl ?? defaultBaseUrl,
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 10),
          headers: {'Content-Type': 'application/json'},
        )),
        _storage = const FlutterSecureStorage() {
    _dio.interceptors.add(_AuthInterceptor(_storage));
  }

  Future<String?> get token => _storage.read(key: _tokenKey);

  Future<void> setToken(String token) async {
    await _storage.write(key: _tokenKey, value: token);
  }

  Future<void> clearToken() async {
    await _storage.delete(key: _tokenKey);
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    final response = await _dio.post('/api/v1/auth/login', data: {
      'email': email,
      'password': password,
    });
    final data = response.data as Map<String, dynamic>;
    await setToken(data['token'] as String);
    return data;
  }

  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
  }) async {
    final response = await _dio.post('/api/v1/auth/register', data: {
      'email': email,
      'password': password,
      'firstName': firstName,
      'lastName': lastName,
    });
    final data = response.data as Map<String, dynamic>;
    await setToken(data['token'] as String);
    return data;
  }

  Future<void> logout() async {
    await clearToken();
  }

  Future<Map<String, dynamic>> getPets({int page = 1, int limit = 20, String? search}) async {
    final queryParams = <String, dynamic>{'page': page, 'limit': limit};
    if (search != null && search.isNotEmpty) queryParams['search'] = search;
    final response = await _dio.get('/api/v1/pets', queryParameters: queryParams);
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createPet({
    required String name,
    required String species,
    String? breed,
    String? sex,
    double? weightKg,
  }) async {
    final response = await _dio.post('/api/v1/pets', data: {
      'name': name,
      'species': species,
      'breed': ?breed,
      'sex': ?sex,
      'weightKg': ?weightKg,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updatePet(String id, {
    String? name,
    String? species,
    String? breed,
    String? sex,
    double? weightKg,
  }) async {
    final response = await _dio.patch('/api/v1/pets/$id', data: {
      'name': ?name,
      'species': ?species,
      'breed': ?breed,
      'sex': ?sex,
      'weightKg': ?weightKg,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<void> deletePet(String id) async {
    await _dio.delete('/api/v1/pets/$id');
  }

  Future<Map<String, dynamic>> getAppointments({int page = 1, int limit = 20, String? search}) async {
    final queryParams = <String, dynamic>{'page': page, 'limit': limit};
    if (search != null && search.isNotEmpty) queryParams['search'] = search;
    final response = await _dio.get('/api/v1/appointments', queryParameters: queryParams);
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createAppointment({
    required String petId,
    required String appointmentType,
    required DateTime scheduledStart,
    required DateTime scheduledEnd,
    String? reason,
    String? veterinarianId,
  }) async {
    final response = await _dio.post('/api/v1/appointments', data: {
      'petId': petId,
      'appointmentType': appointmentType,
      'scheduledStart': scheduledStart.toUtc().toIso8601String(),
      'scheduledEnd': scheduledEnd.toUtc().toIso8601String(),
      'reason': ?reason,
      'veterinarianId': ?veterinarianId,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> cancelAppointment(String id) async {
    final response = await _dio.delete('/api/v1/appointments/$id');
    return response.data as Map<String, dynamic>;
  }

  Dio get dio => _dio;
}

class _AuthInterceptor extends Interceptor {
  final FlutterSecureStorage _storage;

  _AuthInterceptor(this._storage);

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _storage.read(key: 'jwt_token');
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.response?.statusCode == 401) {
      _storage.delete(key: 'jwt_token');
    }
    handler.next(err);
  }
}
