import { memo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import type { Group } from 'three';
import type { EmployeeAppearance, EmployeePhase, WorkActivityKind } from './employeeWorkflow';

export interface HumanPoseInput {
  phase: EmployeePhase;
  activity: WorkActivityKind;
  /** 0 = seated in chair, 1 = standing upright on floor. */
  standBlend: number;
  /** Normalized walking speed (0..1) used to drive gait amplitude. */
  walkSpeed: number;
  /** Subtle seed offset so employees don't breathe/type in robotic unison. */
  seed: number;
  /** True when the agent has an active backend task at their desk. */
  workingAtDesk: boolean;
  /** Whether the desk equipment being worked on is a laptop, desktop monitor, or hybrid. */
  workEquipment?: 'laptop' | 'monitor' | 'hybrid';
}

function lerpAngle(current: number, target: number, alpha: number): number {
  return current + (target - current) * alpha;
}

/**
 * Realistic stylized 3D human employee with articulated pelvis, torso, head, hairstyles,
 * glasses, professional attire, arms, forearms, hands, thighs, calves, and shoes.
 * Smoothly blends between seated typing/reading, reacting, standing up, walking,
 * resource-specific interactions, completing, and sitting back down.
 */
function HumanCharacterImpl({
  appearance,
  poseRef,
}: {
  appearance: EmployeeAppearance;
  poseRef: React.RefObject<HumanPoseInput>;
}) {
  const reducedMotion = useReducedMotion();
  const rootRef = useRef<Group>(null);
  const torsoRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const leftUpperArm = useRef<Group>(null);
  const rightUpperArm = useRef<Group>(null);
  const leftForearm = useRef<Group>(null);
  const rightForearm = useRef<Group>(null);
  const leftThigh = useRef<Group>(null);
  const rightThigh = useRef<Group>(null);
  const leftShin = useRef<Group>(null);
  const rightShin = useRef<Group>(null);

  const walkPhase = useRef(0);

  useFrame(({ clock }, rawDelta) => {
    const pose = poseRef.current;
    if (!pose) return;
    const dt = Math.min(rawDelta, 0.05);
    const t = reducedMotion ? 0 : clock.elapsedTime + pose.seed;
    const blend = Math.min(1, dt * 11);

    const stand = pose.standBlend;
    const isWalking = (pose.phase === 'walking_to_resource' || pose.phase === 'walking_back') && pose.walkSpeed > 0.05;
    if (isWalking && !reducedMotion) {
      walkPhase.current += dt * (6.2 + pose.walkSpeed * 2.6);
    }

    const stride = isWalking ? Math.sin(walkPhase.current) * pose.walkSpeed : 0;
    const strideOpp = isWalking ? Math.sin(walkPhase.current + Math.PI) * pose.walkSpeed : 0;
    const bounce = isWalking ? Math.abs(Math.sin(walkPhase.current)) * 0.032 * pose.walkSpeed : 0;
    const breath = reducedMotion ? 0 : Math.sin(t * 2.1) * 0.008;

    // Pelvis height: seated ~0.48 above floor vs standing ~0.77 above floor
    const pelvisY = 0.49 + stand * 0.28 + bounce + breath;
    if (rootRef.current) {
      rootRef.current.position.y = lerpAngle(rootRef.current.position.y, pelvisY, blend);
    }

    // Leg angles: seated bends thighs forward (-1.45 rad) & shins straight down (+1.42 rad)
    let ltX = -1.42 * (1 - stand) + stride * 0.56 * stand;
    let rtX = -1.42 * (1 - stand) + strideOpp * 0.56 * stand;
    let lsX = 1.38 * (1 - stand) + Math.max(0, -stride) * 0.52 * stand;
    let rsX = 1.38 * (1 - stand) + Math.max(0, -strideOpp) * 0.52 * stand;

    if (pose.phase === 'standing_up' || pose.phase === 'sitting_down') {
      // Slight crouch mid-transition for believable weight shift
      const mid = Math.sin(stand * Math.PI);
      ltX -= mid * 0.22;
      rtX -= mid * 0.22;
      lsX += mid * 0.35;
      rsX += mid * 0.35;
    }

    if (leftThigh.current) leftThigh.current.rotation.x = lerpAngle(leftThigh.current.rotation.x, ltX, blend);
    if (rightThigh.current) rightThigh.current.rotation.x = lerpAngle(rightThigh.current.rotation.x, rtX, blend);
    if (leftShin.current) leftShin.current.rotation.x = lerpAngle(leftShin.current.rotation.x, lsX, blend);
    if (rightShin.current) rightShin.current.rotation.x = lerpAngle(rightShin.current.rotation.x, rsX, blend);

    // Upper body & head target angles by phase and activity
    let torsoPitch = 0.04 * (1 - stand);
    let torsoYaw = 0;
    let headPitch = 0.08 * (1 - stand);
    let headYaw = 0;
    let laX = 0;
    let raX = 0;
    let laZ = 0.08;
    let raZ = -0.08;
    let lfX = -0.15;
    let rfX = -0.15;

    if (isWalking) {
      torsoPitch = 0.08 * pose.walkSpeed;
      torsoYaw = stride * 0.08;
      headPitch = 0.02;
      headYaw = Math.sin(t * 0.7) * 0.08;
      laX = strideOpp * 0.48;
      raX = stride * 0.48;
      lfX = -0.22 - Math.max(0, -strideOpp) * 0.24;
      rfX = -0.22 - Math.max(0, -stride) * 0.24;
    } else if (pose.phase === 'reacting') {
      // Employee perks up attentively upon task assignment
      torsoPitch = -0.06;
      headPitch = -0.12;
      headYaw = Math.sin(t * 3.5) * 0.16;
      laX = -0.55;
      raX = -0.68;
      lfX = -0.85;
      rfX = -0.95;
    } else if (pose.phase === 'completing') {
      // Natural nod of completion
      torsoPitch = -0.02;
      headPitch = Math.sin(t * 7.5) * 0.14;
      headYaw = 0.05;
      laX = -0.25;
      raX = -0.85;
      rfX = -0.95;
      raZ = -0.18;
    } else if (pose.phase === 'interacting') {
      switch (pose.activity) {
        case 'coding':
        case 'browser_automation': {
          torsoPitch = 0.11;
          headPitch = 0.1 + Math.sin(t * 1.4) * 0.04;
          headYaw = Math.sin(t * 1.1) * 0.18;
          const typeA = Math.sin(t * 14) * 0.08;
          const typeB = Math.cos(t * 14.5) * 0.08;
          laX = -0.78 + typeA;
          raX = -0.78 + typeB;
          lfX = -0.72 - typeA;
          rfX = -0.72 - typeB;
          break;
        }
        case 'research': {
          torsoPitch = 0.14;
          headPitch = 0.08 + Math.sin(t * 1.2) * 0.06;
          headYaw = Math.sin(t * 1.6) * 0.26;
          laX = -0.65;
          lfX = -0.82;
          raX = -0.95 + Math.sin(t * 3.1) * 0.12;
          rfX = -0.88;
          break;
        }
        case 'data_analysis': {
          torsoPitch = 0.06;
          headPitch = -0.06 + Math.sin(t * 1.3) * 0.05;
          headYaw = Math.sin(t * 1.3) * 0.28;
          laX = -0.45;
          lfX = -0.95;
          raX = -1.1 + Math.sin(t * 2.6) * 0.14;
          rfX = -0.42;
          raZ = -0.16;
          break;
        }
        case 'collaboration':
        case 'communication': {
          torsoPitch = 0.05;
          torsoYaw = Math.sin(t * 1.7) * 0.14;
          headPitch = Math.sin(t * 3.2) * 0.08;
          headYaw = Math.sin(t * 1.9) * 0.24;
          laX = -0.58 + Math.sin(t * 3.8) * 0.18;
          raX = -0.64 + Math.cos(t * 3.4) * 0.2;
          laZ = 0.22;
          raZ = -0.22;
          lfX = -0.85;
          rfX = -0.85;
          break;
        }
        default: {
          torsoPitch = 0.08;
          headYaw = Math.sin(t * 1.4) * 0.2;
          laX = -0.68 + Math.sin(t * 6) * 0.06;
          raX = -0.72 + Math.cos(t * 6) * 0.06;
          lfX = -0.78;
          rfX = -0.78;
        }
      }
    } else if (stand < 0.4) {
      // Seated at desk: alive natural idle or active desk work
      const activeRate = pose.workingAtDesk ? 14.5 : 7.0;
      const activeAmp = pose.workingAtDesk ? 0.095 : 0.045;
      const equip = pose.workEquipment ?? 'monitor';

      if (equip === 'laptop') {
        // Working on Laptop: head tilted down towards laptop screen, arms positioned inward over laptop keyboard & trackpad
        torsoPitch = pose.workingAtDesk ? 0.14 : 0.08;
        headPitch = 0.22 + Math.sin(t * 0.9) * 0.035;
        headYaw = Math.sin(t * (pose.workingAtDesk ? 1.2 : 0.5)) * 0.12;

        const t1 = Math.sin(t * activeRate) * activeAmp;
        const t2 = Math.cos(t * (activeRate + 0.6)) * activeAmp;
        const trackpadGesture = Math.sin(t * 0.8) > 0.85 ? 0.05 : 0;

        laZ = 0.14;
        raZ = -0.14;
        laX = -0.58 + t1;
        raX = -0.58 + t2 + trackpadGesture;
        lfX = -0.94 - t1 * 0.8;
        rfX = -0.94 - t2 * 0.8;
      } else if (equip === 'hybrid') {
        // Multi-screen / Hybrid: glances between laptop on the left and primary monitor on the right
        torsoPitch = pose.workingAtDesk ? 0.10 : 0.06;
        headPitch = 0.11 + Math.sin(t * 0.7) * 0.04;
        headYaw = -0.18 + Math.sin(t * 1.1) * 0.32; // glances between laptop & screen

        const t1 = Math.sin(t * activeRate) * activeAmp;
        const t2 = Math.cos(t * (activeRate + 0.8)) * activeAmp;
        laX = -0.64 + t1;
        raX = -0.66 + t2;
        laZ = 0.12;
        raZ = -0.16;
        lfX = -0.86 - t1;
        rfX = -0.84 - t2;
      } else {
        // Working on Desktop Monitor: head looking up at eye-level monitors, hands on mechanical keyboard & wireless mouse
        torsoPitch = pose.workingAtDesk ? 0.08 : 0.04;
        headPitch = 0.03 + Math.sin(t * 0.8) * 0.03;
        headYaw = Math.sin(t * (pose.workingAtDesk ? 1.4 : 0.7)) * 0.28; // pans across dual displays

        const t1 = Math.sin(t * activeRate) * activeAmp;
        const t2 = Math.cos(t * (activeRate + 0.8)) * activeAmp;
        laX = -0.68 + t1;
        // Right hand operates mouse on mousepad with intermittent typing & clicking
        raX = -0.62 + t2 * 0.6;
        raZ = -0.20;
        laZ = 0.08;
        lfX = -0.82 - t1;
        rfX = -0.85;
      }
    }

    if (torsoRef.current) {
      torsoRef.current.rotation.x = lerpAngle(torsoRef.current.rotation.x, torsoPitch, blend);
      torsoRef.current.rotation.y = lerpAngle(torsoRef.current.rotation.y, torsoYaw, blend);
    }
    if (headRef.current) {
      headRef.current.rotation.x = lerpAngle(headRef.current.rotation.x, headPitch, blend);
      headRef.current.rotation.y = lerpAngle(headRef.current.rotation.y, headYaw, blend);
    }
    if (leftUpperArm.current) {
      leftUpperArm.current.rotation.x = lerpAngle(leftUpperArm.current.rotation.x, laX, blend);
      leftUpperArm.current.rotation.z = lerpAngle(leftUpperArm.current.rotation.z, laZ, blend);
    }
    if (rightUpperArm.current) {
      rightUpperArm.current.rotation.x = lerpAngle(rightUpperArm.current.rotation.x, raX, blend);
      rightUpperArm.current.rotation.z = lerpAngle(rightUpperArm.current.rotation.z, raZ, blend);
    }
    if (leftForearm.current) leftForearm.current.rotation.x = lerpAngle(leftForearm.current.rotation.x, lfX, blend);
    if (rightForearm.current) rightForearm.current.rotation.x = lerpAngle(rightForearm.current.rotation.x, rfX, blend);
  });

  const jacketColor = appearance.jacket ?? appearance.top;

  return (
    <group ref={rootRef} position={[0, 0.49, 0]}>
      {/* Pelvis / Hip block */}
      <RoundedBox args={[0.3, 0.14, 0.19]} radius={0.05} smoothness={1} position={[0, 0.02, 0]}>
        <meshStandardMaterial color={appearance.pants} roughness={0.78} />
      </RoundedBox>

      {/* Articulated Legs (Left & Right) */}
      {[
        { x: -0.085, thighRef: leftThigh, shinRef: leftShin },
        { x: 0.085, thighRef: rightThigh, shinRef: rightShin },
      ].map(({ x, thighRef, shinRef }) => (
        <group key={x} ref={thighRef} position={[x, -0.02, 0]}>
          {/* Thigh */}
          <mesh position={[0, -0.18, 0]} castShadow>
            <capsuleGeometry args={[0.06, 0.24, 4, 8]} />
            <meshStandardMaterial color={appearance.pants} roughness={0.8} />
          </mesh>
          {/* Knee pivot -> Lower leg & Shoe */}
          <group ref={shinRef} position={[0, -0.36, 0]}>
            <mesh position={[0, -0.17, 0]}>
              <capsuleGeometry args={[0.05, 0.24, 4, 8]} />
              <meshStandardMaterial color={appearance.pants} roughness={0.82} />
            </mesh>
            {/* Ankle & Shoe */}
            <mesh position={[0, -0.35, 0.038]}>
              <boxGeometry args={[0.095, 0.075, 0.18]} />
              <meshStandardMaterial color={appearance.shoes} roughness={0.62} />
            </mesh>
          </group>
        </group>
      ))}

      {/* Upper Body / Spine pivot */}
      <group ref={torsoRef} position={[0, 0.08, 0]}>
        {/* Blazer / Sweater torso */}
        <RoundedBox args={[0.34, 0.44, 0.2]} radius={0.065} smoothness={1} position={[0, 0.23, 0]} castShadow>
          <meshStandardMaterial color={jacketColor} roughness={0.74} />
        </RoundedBox>
        {/* Crisp inner shirt V-front */}
        <mesh position={[0, 0.28, 0.098]}>
          <boxGeometry args={[0.11, 0.24, 0.018]} />
          <meshStandardMaterial color={appearance.top} roughness={0.68} />
        </mesh>
        {/* Subtle lapel / collar detail */}
        {[-0.065, 0.065].map((lx) => (
          <mesh key={lx} position={[lx, 0.34, 0.1]} rotation={[0, 0, lx > 0 ? -0.22 : 0.22]}>
            <boxGeometry args={[0.045, 0.16, 0.018]} />
            <meshStandardMaterial color={jacketColor} roughness={0.7} />
          </mesh>
        ))}

        {/* Neck */}
        <mesh position={[0, 0.48, 0]}>
          <cylinderGeometry args={[0.048, 0.056, 0.1, 8]} />
          <meshStandardMaterial color={appearance.skin} roughness={0.62} />
        </mesh>

        {/* Sculpted Head & Hair */}
        <group ref={headRef} position={[0, 0.62, 0.01]}>
          {/* Cranium / Face */}
          <mesh castShadow>
            <sphereGeometry args={[0.135, 14, 12]} />
            <meshStandardMaterial color={appearance.skin} roughness={0.58} />
          </mesh>
          {/* Ears */}
          {[-0.132, 0.132].map((ex) => (
            <mesh key={ex} position={[ex, -0.01, -0.01]}>
              <sphereGeometry args={[0.026, 6, 6]} />
              <meshStandardMaterial color={appearance.skin} roughness={0.62} />
            </mesh>
          ))}
          {/* Subtle nose */}
          <mesh position={[0, -0.015, 0.132]}>
            <sphereGeometry args={[0.018, 6, 6]} />
            <meshStandardMaterial color={appearance.skin} roughness={0.6} />
          </mesh>
          {/* Eyes & Eyebrows */}
          {[-0.044, 0.044].map((ex) => (
            <group key={ex} position={[ex, 0.016, 0.12]}>
              <mesh>
                <sphereGeometry args={[0.013, 6, 6]} />
                <meshStandardMaterial color="#1F242D" roughness={0.25} />
              </mesh>
              <mesh position={[0, 0.026, -0.002]}>
                <boxGeometry args={[0.032, 0.008, 0.01]} />
                <meshStandardMaterial color={appearance.hair} roughness={0.8} />
              </mesh>
            </group>
          ))}
          {/* Optional modern eyeglasses */}
          {appearance.hasGlasses && (
            <group position={[0, 0.016, 0.132]}>
              {[-0.045, 0.045].map((gx) => (
                <mesh key={gx} position={[gx, 0, 0]}>
                  <torusGeometry args={[0.028, 0.0045, 6, 12]} />
                  <meshStandardMaterial color="#27272A" metalness={0.55} roughness={0.3} />
                </mesh>
              ))}
              <mesh position={[0, 0.004, 0]}>
                <boxGeometry args={[0.034, 0.005, 0.005]} />
                <meshStandardMaterial color="#27272A" metalness={0.55} roughness={0.3} />
              </mesh>
            </group>
          )}

          {/* Distinct Stylized Hairstyles */}
          {appearance.hairStyle === 'short' && (
            <group>
              <mesh position={[0, 0.038, -0.014]} scale={[1.05, 0.92, 1.05]}>
                <sphereGeometry args={[0.138, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
                <meshStandardMaterial color={appearance.hair} roughness={0.85} />
              </mesh>
              <mesh position={[0.02, 0.105, 0.055]} rotation={[-0.25, 0, -0.15]}>
                <boxGeometry args={[0.16, 0.045, 0.08]} />
                <meshStandardMaterial color={appearance.hair} roughness={0.85} />
              </mesh>
            </group>
          )}
          {appearance.hairStyle === 'fade' && (
            <mesh position={[0, 0.055, -0.01]} scale={[1.02, 0.85, 1.03]}>
              <sphereGeometry args={[0.136, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.54]} />
              <meshStandardMaterial color={appearance.hair} roughness={0.88} />
            </mesh>
          )}
          {appearance.hairStyle === 'bun' && (
            <group>
              <mesh position={[0, 0.028, -0.016]} scale={[1.06, 0.96, 1.06]}>
                <sphereGeometry args={[0.138, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.68]} />
                <meshStandardMaterial color={appearance.hair} roughness={0.84} />
              </mesh>
              <mesh position={[0, 0.13, -0.1]}>
                <sphereGeometry args={[0.062, 10, 8]} />
                <meshStandardMaterial color={appearance.hair} roughness={0.84} />
              </mesh>
            </group>
          )}
          {appearance.hairStyle === 'bob' && (
            <group>
              <mesh position={[0, 0.025, -0.015]} scale={[1.08, 0.98, 1.08]}>
                <sphereGeometry args={[0.14, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.72]} />
                <meshStandardMaterial color={appearance.hair} roughness={0.82} />
              </mesh>
              {[-0.125, 0.125].map((hx) => (
                <mesh key={hx} position={[hx, -0.055, -0.01]}>
                  <capsuleGeometry args={[0.036, 0.11, 4, 8]} />
                  <meshStandardMaterial color={appearance.hair} roughness={0.82} />
                </mesh>
              ))}
              <mesh position={[0, -0.055, -0.115]}>
                <boxGeometry args={[0.22, 0.15, 0.06]} />
                <meshStandardMaterial color={appearance.hair} roughness={0.82} />
              </mesh>
            </group>
          )}
          {appearance.hairStyle === 'wavy' && (
            <group>
              <mesh position={[0, 0.024, -0.018]} scale={[1.08, 0.98, 1.08]}>
                <sphereGeometry args={[0.14, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.72]} />
                <meshStandardMaterial color={appearance.hair} roughness={0.82} />
              </mesh>
              <mesh position={[0, -0.09, -0.115]}>
                <boxGeometry args={[0.24, 0.24, 0.075]} />
                <meshStandardMaterial color={appearance.hair} roughness={0.82} />
              </mesh>
            </group>
          )}
        </group>

        {/* Articulated Arms (Left & Right) */}
        {[
          { x: -0.215, upperRef: leftUpperArm, foreRef: leftForearm },
          { x: 0.215, upperRef: rightUpperArm, foreRef: rightForearm },
        ].map(({ x, upperRef, foreRef }) => (
          <group key={x} ref={upperRef} position={[x, 0.39, 0]}>
            {/* Shoulder cap */}
            <mesh>
              <sphereGeometry args={[0.058, 8, 6]} />
              <meshStandardMaterial color={jacketColor} roughness={0.75} />
            </mesh>
            {/* Upper arm */}
            <mesh position={[0, -0.12, 0]}>
              <capsuleGeometry args={[0.044, 0.16, 4, 8]} />
              <meshStandardMaterial color={jacketColor} roughness={0.75} />
            </mesh>
            {/* Elbow pivot -> Forearm + Hand */}
            <group ref={foreRef} position={[0, -0.24, 0]}>
              <mesh position={[0, -0.1, 0]}>
                <capsuleGeometry args={[0.038, 0.14, 4, 8]} />
                <meshStandardMaterial color={jacketColor} roughness={0.75} />
              </mesh>
              {/* Hand */}
              <mesh position={[0, -0.21, 0.01]}>
                <sphereGeometry args={[0.036, 6, 6]} />
                <meshStandardMaterial color={appearance.skin} roughness={0.62} />
              </mesh>
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}

export const HumanCharacter = memo(HumanCharacterImpl);
