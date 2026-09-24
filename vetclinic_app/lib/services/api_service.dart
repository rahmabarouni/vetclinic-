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
    required bool privacyConsent,
  }) async {
    final response = await _dio.post('/api/v1/auth/register', data: {
      'email': email,
      'password': password,
      'firstName': firstName,
      'lastName': lastName,
      'privacyConsent': privacyConsent,
    });
    final data = response.data as Map<String, dynamic>;
    await setToken(data['token'] as String);
    return data;
  }

  Future<void> logout() async {
    await clearToken();
  }

  Future<Map<String, dynamic>> loginWithGoogle({required String idToken}) async {
    final response = await _dio.post('/api/v1/auth/google', data: {
      'idToken': idToken,
    });
    final data = response.data as Map<String, dynamic>;
    await setToken(data['token'] as String);
    return data;
  }

  Future<Map<String, dynamic>> verifyEmail({
    required String email,
    required String code,
  }) async {
    final response = await _dio.post('/api/v1/auth/verify-email', data: {
      'email': email,
      'code': code,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> resendVerification({required String email}) async {
    final response = await _dio.post('/api/v1/auth/resend-verification', data: {
      'email': email,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getProfile() async {
    final response = await _dio.get('/api/v1/users/profile');
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateProfile({
    String? firstName,
    String? lastName,
    String? phone,
    String? address,
  }) async {
    final response = await _dio.put('/api/v1/users/profile', data: {
      'firstName': ?firstName,
      'lastName': ?lastName,
      'phone': ?phone,
      'address': ?address,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<String> uploadFile({
    required String path,
    required String filename,
  }) async {
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(path, filename: filename),
    });
    final response = await _dio.post('/api/v1/uploads', data: form);
    final upload = (response.data as Map<String, dynamic>)['upload'] as Map<String, dynamic>;
    return upload['url'] as String;
  }

  Future<void> registerFcmToken(String token) async {
    await _dio.put('/api/v1/fcm-token', data: {'token': token});
  }

  Future<void> unregisterFcmToken() async {
    await _dio.delete('/api/v1/fcm-token');
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
    String? photoUrl,
  }) async {
    final response = await _dio.post('/api/v1/pets', data: {
      'name': name,
      'species': species,
      'breed': ?breed,
      'sex': ?sex,
      'weightKg': ?weightKg,
      'photoUrl': ?photoUrl,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updatePet(String id, {
    String? name,
    String? species,
    String? breed,
    String? sex,
    double? weightKg,
    String? photoUrl,
  }) async {
    final response = await _dio.patch('/api/v1/pets/$id', data: {
      'name': ?name,
      'species': ?species,
      'breed': ?breed,
      'sex': ?sex,
      'weightKg': ?weightKg,
      'photoUrl': ?photoUrl,
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

  Future<Map<String, dynamic>> getVeterinarians({bool availableOnly = false}) async {
    final response = await _dio.get('/api/v1/veterinarians', queryParameters: {
      if (availableOnly) 'availableOnly': true,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getConversations({int page = 1, int limit = 20}) async {
    final response = await _dio.get('/api/v1/conversations', queryParameters: {'page': page, 'limit': limit});
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getMedicalRecords(String petId) async {
    final response = await _dio.get('/api/v1/pets/$petId/medical-records');
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getPetDocuments(String petId) async {
    final response = await _dio.get('/api/v1/pets/$petId/documents');
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createConversation({String? veterinarianId}) async {
    final response = await _dio.post('/api/v1/conversations', data: {
      'veterinarianId': ?veterinarianId,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getMessages(String conversationId, {int page = 1, int limit = 50}) async {
    final response = await _dio.get('/api/v1/conversations/$conversationId/messages',
        queryParameters: {'page': page, 'limit': limit});
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> sendMessage(String conversationId, {String? content, String? attachmentUrl, String? attachmentType}) async {
    final response = await _dio.post('/api/v1/conversations/$conversationId/messages', data: {
      if (content != null && content.isNotEmpty) 'content': content,
      'attachmentUrl': ?attachmentUrl,
      'attachmentType': ?attachmentType,
    });
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
