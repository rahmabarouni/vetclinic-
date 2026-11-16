import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/appointment.dart';
import '../services/api_service.dart';
import 'auth_provider.dart';

enum AppointmentsStatus { initial, loading, loaded, error }

class AppointmentsState {
  final AppointmentsStatus status;
  final List<Appointment> appointments;
  final int total;
  final int page;
  final String? error;

  AppointmentsState({
    this.status = AppointmentsStatus.initial,
    this.appointments = const [],
    this.total = 0,
    this.page = 1,
    this.error,
  });

  AppointmentsState copyWith({
    AppointmentsStatus? status,
    List<Appointment>? appointments,
    int? total,
    int? page,
    String? error,
  }) {
    return AppointmentsState(
      status: status ?? this.status,
      appointments: appointments ?? this.appointments,
      total: total ?? this.total,
      page: page ?? this.page,
      error: error ?? this.error,
    );
  }
}

class AppointmentsNotifier extends StateNotifier<AppointmentsState> {
  final ApiService _api;

  AppointmentsNotifier(this._api) : super(AppointmentsState()) {
    loadAppointments();
  }

  Future<void> loadAppointments({int page = 1, String? search}) async {
    state = state.copyWith(status: AppointmentsStatus.loading);
    try {
      final data = await _api.getAppointments(page: page, search: search);
      final List<dynamic> items = data['data'] ?? [];
      final appointments = items.map((j) => Appointment.fromJson(j as Map<String, dynamic>)).toList();
      final pagination = data['pagination'] as Map<String, dynamic>? ?? {};
      state = state.copyWith(
        status: AppointmentsStatus.loaded,
        appointments: appointments,
        total: pagination['total'] ?? appointments.length,
        page: pagination['page'] ?? page,
      );
    } catch (e) {
      state = state.copyWith(status: AppointmentsStatus.error, error: e.toString());
    }
  }

  Future<bool> createAppointment({
    required String petId,
    required String appointmentType,
    required DateTime scheduledStart,
    required DateTime scheduledEnd,
    String? reason,
    String? veterinarianId,
  }) async {
    state = state.copyWith(status: AppointmentsStatus.loading);
    try {
      await _api.createAppointment(
        petId: petId,
        appointmentType: appointmentType,
        scheduledStart: scheduledStart,
        scheduledEnd: scheduledEnd,
        reason: reason,
        veterinarianId: veterinarianId,
      );
      await loadAppointments(page: state.page);
      return true;
    } catch (e) {
      String message = "Erreur lors de la création";
      if (e.toString().contains('409')) {
        message = "Créneau déjà occupé pour cet animal ou ce vétérinaire";
      } else if (e.toString().contains('403')) {
        message = "Accès refusé";
      } else if (e.toString().contains('400')) {
        message = "Données invalides";
      }
      state = state.copyWith(status: AppointmentsStatus.error, error: message);
      return false;
    }
  }

  bool _lastChangeApplied = false;
  bool get lastChangeApplied => _lastChangeApplied;

  Future<bool> requestChange({
    required String appointmentId,
    required DateTime proposedStart,
    required DateTime proposedEnd,
    String? proposedType,
    String? proposedReason,
  }) async {
    state = state.copyWith(status: AppointmentsStatus.loading);
    try {
      final data = await _api.createChangeRequest(
        appointmentId,
        proposedStart: proposedStart,
        proposedEnd: proposedEnd,
        proposedType: proposedType,
        proposedReason: proposedReason,
      );
      _lastChangeApplied = data['applied'] == true;
      await loadAppointments(page: state.page);
      return true;
    } catch (e) {
      String message = 'Erreur lors de la demande de modification';
      if (e.toString().contains('409')) {
        message = 'Créneau indisponible ou demande déjà en attente';
      } else if (e.toString().contains('403')) {
        message = 'Accès refusé';
      } else if (e.toString().contains('400')) {
        message = 'Données invalides';
      }
      state = state.copyWith(status: AppointmentsStatus.error, error: message);
      return false;
    }
  }

  /// Annule une demande de modification en attente (côté client).
  /// Retourne `null` en cas de succès, sinon un message d'erreur.
  Future<String?> cancelChangeRequest(String id) async {
    try {
      await _api.cancelChangeRequest(id);
      await loadAppointments(page: state.page);
      return null;
    } catch (e) {
      if (e.toString().contains('409')) {
        return 'Cette demande a déjà été traitée';
      }
      if (e.toString().contains('404')) {
        return 'Demande de modification introuvable';
      }
      if (e.toString().contains('403')) {
        return 'Accès refusé';
      }
      return "Erreur lors de l'annulation de la demande";
    }
  }

  Future<bool> cancelAppointment(String id) async {
    try {
      await _api.cancelAppointment(id);
      await loadAppointments(page: state.page);
      return true;
    } catch (e) {
      String message = "Erreur lors de l'annulation";
      if (e.toString().contains('403')) {
        message = "Accès refusé";
      }
      state = state.copyWith(status: AppointmentsStatus.error, error: message);
      return false;
    }
  }

  Future<void> refresh() async {
    await loadAppointments(page: state.page);
  }
}

final appointmentsProvider = StateNotifierProvider<AppointmentsNotifier, AppointmentsState>((ref) {
  return AppointmentsNotifier(ref.watch(apiServiceProvider));
});
