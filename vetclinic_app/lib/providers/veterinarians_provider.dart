import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/veterinarian.dart';
import '../services/api_service.dart';
import 'auth_provider.dart';

enum VeterinariansStatus { initial, loading, loaded, error }

class VeterinariansState {
  final VeterinariansStatus status;
  final List<Veterinarian> veterinarians;
  final String? error;

  VeterinariansState({
    this.status = VeterinariansStatus.initial,
    this.veterinarians = const [],
    this.error,
  });

  VeterinariansState copyWith({
    VeterinariansStatus? status,
    List<Veterinarian>? veterinarians,
    String? error,
  }) {
    return VeterinariansState(
      status: status ?? this.status,
      veterinarians: veterinarians ?? this.veterinarians,
      error: error ?? this.error,
    );
  }
}

class VeterinariansNotifier extends StateNotifier<VeterinariansState> {
  final ApiService _api;

  VeterinariansNotifier(this._api) : super(VeterinariansState());

  Future<void> loadVeterinarians({bool availableOnly = false}) async {
    state = state.copyWith(status: VeterinariansStatus.loading);
    try {
      final data = await _api.getVeterinarians(availableOnly: availableOnly);
      final List<dynamic> items = data['data'] ?? [];
      final veterinarians =
          items.map((j) => Veterinarian.fromJson(j as Map<String, dynamic>)).toList();
      state = state.copyWith(
        status: VeterinariansStatus.loaded,
        veterinarians: veterinarians,
        error: null,
      );
    } catch (e) {
      state = state.copyWith(status: VeterinariansStatus.error, error: e.toString());
    }
  }

  Future<void> refresh() async => loadVeterinarians();
}

final veterinariansProvider =
    StateNotifierProvider<VeterinariansNotifier, VeterinariansState>((ref) {
  return VeterinariansNotifier(ref.watch(apiServiceProvider));
});