import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/pet.dart';
import '../services/api_service.dart';
import 'auth_provider.dart';

enum PetsStatus { initial, loading, loaded, error }

class PetsState {
  final PetsStatus status;
  final List<Pet> pets;
  final int total;
  final int page;
  final String? error;

  PetsState({
    this.status = PetsStatus.initial,
    this.pets = const [],
    this.total = 0,
    this.page = 1,
    this.error,
  });

  PetsState copyWith({
    PetsStatus? status,
    List<Pet>? pets,
    int? total,
    int? page,
    String? error,
  }) {
    return PetsState(
      status: status ?? this.status,
      pets: pets ?? this.pets,
      total: total ?? this.total,
      page: page ?? this.page,
      error: error ?? this.error,
    );
  }
}

class PetsNotifier extends StateNotifier<PetsState> {
  final ApiService _api;

  PetsNotifier(this._api) : super(PetsState()) {
    loadPets();
  }

  Future<void> loadPets({int page = 1, String? search}) async {
    state = state.copyWith(status: PetsStatus.loading);
    try {
      final data = await _api.getPets(page: page, search: search);
      final List<dynamic> items = data['data'] ?? [];
      final pets = items.map((j) => Pet.fromJson(j as Map<String, dynamic>)).toList();
      final pagination = data['pagination'] as Map<String, dynamic>? ?? {};
      state = state.copyWith(
        status: PetsStatus.loaded,
        pets: pets,
        total: pagination['total'] ?? pets.length,
        page: pagination['page'] ?? page,
      );
    } catch (e) {
      state = state.copyWith(status: PetsStatus.error, error: e.toString());
    }
  }

  Future<bool> createPet({
    required String name,
    required String species,
    String? breed,
    String? sex,
    double? weightKg,
    String? photoUrl,
  }) async {
    state = state.copyWith(status: PetsStatus.loading);
    try {
      await _api.createPet(name: name, species: species, breed: breed, sex: sex, weightKg: weightKg, photoUrl: photoUrl);
      await loadPets(page: state.page);
      return true;
    } catch (e) {
      String message = "Erreur lors de la création";
      if (e.toString().contains('409')) {
        message = "Cet animal existe déjà";
      } else if (e.toString().contains('403')) {
        message = "Accès refusé";
      } else if (e.toString().contains('400')) {
        message = "Données invalides";
      }
      state = state.copyWith(status: PetsStatus.error, error: message);
      return false;
    }
  }

  Future<void> refresh() async {
    await loadPets(page: state.page);
  }
}

final petsProvider = StateNotifierProvider<PetsNotifier, PetsState>((ref) {
  return PetsNotifier(ref.watch(apiServiceProvider));
});
