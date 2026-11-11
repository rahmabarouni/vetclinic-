import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/appointment.dart';
import '../models/pet.dart';
import '../providers/appointments_provider.dart';
import '../providers/auth_provider.dart';
import '../providers/notifications_provider.dart';
import '../providers/pets_provider.dart';
import '../theme/app_theme.dart';
import '../utils/date_utils.dart';
import '../widgets/pet_species_image.dart';
import 'appointment_form_screen.dart';
import 'notifications_screen.dart';
import 'pet_detail_screen.dart';
import 'pet_form_screen.dart';
import 'pets_list_screen.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final petsState = ref.watch(petsProvider);
    final appointmentsState = ref.watch(appointmentsProvider);
    final unreadCount = ref.watch(notificationsProvider.select((s) => s.unreadCount));

    final nextAppointment = _nextUpcoming(appointmentsState);

    return Scaffold(
      appBar: AppBar(
        title: const Text('PawCare'),
        centerTitle: false,
        actions: [
          IconButton(
            tooltip: 'Notifications',
            onPressed: () async {
              await Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const NotificationsScreen()),
              );
              if (context.mounted) {
                ref.read(notificationsProvider.notifier).refreshUnreadCount();
              }
            },
            icon: Stack(
              clipBehavior: Clip.none,
              children: [
                const Icon(Icons.notifications_none),
                if (unreadCount > 0)
                  Positioned(
                    right: -2,
                    top: -2,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                      constraints: const BoxConstraints(minWidth: 16),
                      decoration: BoxDecoration(
                        color: AppColors.error,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        unreadCount > 99 ? '99+' : '$unreadCount',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await ref.read(petsProvider.notifier).refresh();
          await ref.read(appointmentsProvider.notifier).refresh();
        },
        child: ListView(
          padding: const EdgeInsets.only(bottom: 24),
          children: [
            _WelcomeBanner(firstName: authState.user?.firstName ?? ''),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _NextAppointmentCard(
                    appointment: nextAppointment,
                    loading: appointmentsState.status == AppointmentsStatus.loading,
                  ),
                  const SizedBox(height: 16),
                  _SectionHeader(
                    title: 'Mes animaux',
                    onSeeAll: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const PetsListScreen()),
                    ),
                  ),
                  _PetsRow(petsState: petsState),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Appointment? _nextUpcoming(AppointmentsState state) {
    if (state.status != AppointmentsStatus.loaded) return null;
    final upcoming = state.appointments
        .where((a) => a.status == 'PENDING' || a.status == 'CONFIRMED')
        .toList()
      ..sort((a, b) => a.scheduledStart.compareTo(b.scheduledStart));
    return upcoming.isEmpty ? null : upcoming.first;
  }
}

class _WelcomeBanner extends StatelessWidget {
  final String firstName;
  const _WelcomeBanner({required this.firstName});

  @override
  Widget build(BuildContext context) {
    final name = firstName.isNotEmpty ? 'Bonjour, $firstName !' : 'Bonjour !';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 32, 20, 24),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.primary, AppColors.primaryDark],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(24)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Votre compagnon au cœur des soins',
                  style: TextStyle(color: Colors.white70, fontSize: 14),
                ),
              ],
            ),
          ),
          const CircleAvatar(
            radius: 28,
            backgroundColor: Colors.white24,
            child: Icon(Icons.pets, color: Colors.white, size: 28),
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final VoidCallback? onSeeAll;
  const _SectionHeader({required this.title, this.onSeeAll});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          if (onSeeAll != null)
            TextButton(
              onPressed: onSeeAll,
              child: const Text('Voir tout'),
            ),
        ],
      ),
    );
  }
}

class _NextAppointmentCard extends StatelessWidget {
  final Appointment? appointment;
  final bool loading;
  const _NextAppointmentCard({required this.appointment, required this.loading});

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(20),
          child: Center(child: CircularProgressIndicator()),
        ),
      );
    }

    if (appointment == null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.event_available, color: AppColors.primary, size: 28),
              const SizedBox(height: 8),
              const Text(
                'Aucun prochain rendez-vous',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 4),
              Text(
                'Prenez rendez-vous pour votre compagnon facilement.',
                style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
              ),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const AppointmentFormScreen()),
                ),
                child: const Text('Prendre un rendez-vous'),
              ),
            ],
          ),
        ),
      );
    }

    final color = switch (appointment!.status) {
      'CONFIRMED' => AppColors.success,
      'CANCELLED' => AppColors.error,
      'COMPLETED' => AppColors.primary,
      _ => AppColors.accent,
    };

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: color.withAlpha(26),
              child: Icon(Icons.event, color: color),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    appointment!.typeLabel,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  if (appointment!.pet != null)
                    Text(
                      appointment!.pet!.name,
                      style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
                    ),
                  Text(
                    formatDate(appointment!.scheduledStart),
                    style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PetsRow extends StatelessWidget {
  final PetsState petsState;
  const _PetsRow({required this.petsState});

  @override
  Widget build(BuildContext context) {
    if (petsState.status == PetsStatus.loading ||
        petsState.status == PetsStatus.initial) {
      return const SizedBox(
        height: 96,
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (petsState.status != PetsStatus.loaded || petsState.pets.isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              const Icon(Icons.pets, color: Colors.grey),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Aucun animal. Ajoutez le premier compagnon à votre profil.',
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.add_circle, color: AppColors.primary),
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const PetFormScreen()),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return SizedBox(
      height: 112,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        itemCount: petsState.pets.length,
        separatorBuilder: (context, index) => const SizedBox(width: 12),
        itemBuilder: (context, index) {
          return _PetMiniCard(pet: petsState.pets[index]);
        },
      ),
    );
  }
}

class _PetMiniCard extends StatelessWidget {
  final Pet pet;
  const _PetMiniCard({required this.pet});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => PetDetailScreen(pet: pet)),
      ),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        width: 96,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircleAvatar(
              radius: 22,
              backgroundColor: AppColors.primaryLight,
              child: PetSpeciesImage(species: pet.species, size: 34),
            ),
            const SizedBox(height: 8),
            Text(
              pet.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 2),
            Text(
              pet.speciesLabel,
              maxLines: 1,
              style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
            ),
          ],
        ),
      ),
    );
  }
}