def sql_escape(s):
    return s.replace("'", "''")


PASSWORD = "$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa" # bcrypt for 'Pass1234'


def bulk_insert(table, rows):
    if not rows:
        return ""
    cols = list(rows[0].keys())
    col_sql = ", ".join(f'"{c}"' for c in cols)
    values_sql = []
    for r in rows:
        vals = []
        for c in cols:
            v = r[c]
            if v is None:
                vals.append("NULL")
            elif isinstance(v, str):
                vals.append(f"'{sql_escape(v)}'")
            else:
                vals.append(str(v))
        values_sql.append("(" + ", ".join(vals) + ")")
    return f"INSERT INTO {table} ({col_sql}) VALUES\n" + ",\n".join(values_sql) + ";\n\n"


def generate_all(n_profes, m_jurors, t_internal, t_external, external_nrc, students_per_semester):
    OFFSET = 1000

    sql = ""

    # -------------------------
    # 1. Profesores (users)
    # -------------------------
    prof_users = []
    for k in range(1, n_profes + 1):
        prof_users.append({
            "id_usuario": OFFSET + k,
            "firstName": "Juan",
            "lastName": f"Prof{k}",
            "correo": f"profesor{k}@uninorte.edu.co",
            "id_rol": 3,
            "metodo_auth": "PASSWORD",
            "contrasena": PASSWORD,
            "id_estado_confirmacion": 1,
            "actualizado_en": "2024-01-01 00:00:00"
        })
    sql += bulk_insert("public.usuarios", prof_users)

    # -------------------------
    # 2. Subjects
    # -------------------------
    subjects = []
    for k in range(1, n_profes + 1):
        subjects.append({
            "id_materia": OFFSET + k,
            "nombre": f"Materia{k}",
            "abreviacion": "MAT",
            "codigo": f"MAT{k}{k}{k}{k}",
            "semestre": k,
            "actualizado_en": "2024-01-01 00:00:00"
        })
    sql += bulk_insert("public.materia", subjects)

    # -------------------------
    # 3. NRCs
    # -------------------------
    nrcs = []
    for k in range(1, n_profes + 1):
        nrcs.append({
            "id_nrc": OFFSET + k,
            "codigo": f"{k}{k}{k}{k}",
            "id_materia": OFFSET + k,
            "id_profesor": OFFSET + k,
            "actualizado_en": "2024-01-01 00:00:00"
        })
    sql += bulk_insert("public.nrc", nrcs)

    # -------------------------
    # 4. Jurors
    # -------------------------
    juror_users = []
    for k in range(1, m_jurors + 1):
        juror_users.append({
            "id_usuario": OFFSET + 500 + k,
            "firstName": "Juana",
            "lastName": f"Jur{k}",
            "correo": f"jurado{k}@uninorte.edu.co",
            "id_rol": 4,
            "metodo_auth": "PASSWORD",
            "contrasena": PASSWORD,
            "id_estado_confirmacion": 1,
            "actualizado_en": "2024-01-01 00:00:00"
        })
    sql += bulk_insert("public.usuarios", juror_users)

    # -------------------------
    # 5. Internal students
    # -------------------------
    student_users = []
    for k in range(1, t_internal + 1):
        student_users.append({
            "id_usuario": OFFSET + 1000 + k,
            "firstName": "Pedro",
            "lastName": f"Est{k}",
            "correo": f"estudiante{k}@uninorte.edu.co",
            "id_rol": 2,
            "metodo_auth": "PASSWORD",
            "contrasena": PASSWORD,
            "id_estado_confirmacion": 1,
            "actualizado_en": "2024-01-01 00:00:00"
        })
    sql += bulk_insert("public.usuarios", student_users)

    # -------------------------
    # 6. Teams, integrantes, NRC links, videogames — INTERNAL
    # -------------------------
    teams = []
    integrantes = []
    member_nrc = []
    videogames = []

    students_per_nrc = t_internal // n_profes
    extra = t_internal % n_profes

    student_index = 0
    member_id_counter = OFFSET + 2000
    student_code_counter = 1001

    student_index = 0

    for nrc_k in range(1, n_profes + 1):
        count_here = students_per_semester[nrc_k - 1]

        for i in range(1, count_here + 1):
            student_index += 1
            student_user_id = OFFSET + 1000 + student_index

            team_code = f"N{nrc_k}-MAT-{nrc_k}{i:02d}"

            team_id = OFFSET + 3000 + student_index
            teams.append({
                "id_equipo": team_id,
                "nombre_equipo": f"Team{student_index}",
                "id_edicion": 3,
                "externo": False,
                "codigo_equipo": team_code,
                "id_usuario": student_user_id,
            })

            integrantes.append({
                "id_integrante": member_id_counter,
                "nombre": "Pedro",
                "apellido": f"Est{student_index}",
                "correo": f"estudiante{student_index}@uninorte.edu.co",
                "codigo_estudiantil": student_code_counter,
                "id_equipo": team_id,
                "actualizado_en": "2024-01-01 00:00:00"
            })

            member_nrc.append({
                "A": member_id_counter,
                "B": OFFSET + nrc_k,
            })

            videogames.append({
                "id_videojuego": OFFSET + 4000 + student_index,
                "nombre": f"Juego{student_index}",
                "descripcion": f"Descripción{student_index}",
                "id_estado_videojuego": 1,
                "id_equipo": team_id,
            })

            member_id_counter += 1
            student_code_counter += 1


    # -------------------------
    # 7. External teams
    # -------------------------
    external_users = []
    for k in range(1, t_external + 1):
        ext_id = OFFSET + 5000 + k
        external_users.append({
            "id_usuario": ext_id,
            "firstName": "Pedro",
            "lastName": f"Ext{k}",
            "correo": f"externo{k}@uninorte.edu.co",
            "id_rol": 2,
            "metodo_auth": "PASSWORD",
            "contrasena": PASSWORD,
            "id_estado_confirmacion": 1,
            "actualizado_en": "2024-01-01 00:00:00"
        })

    sql += bulk_insert("usuarios", external_users)

    for k in range(1, t_external + 1):
        idx = t_internal + k

        student_user_id = OFFSET + 5000 + k
        team_id = OFFSET + 6000 + k

        team_code = f"N0-MAT-{k:03d}"

        teams.append({
            "id_equipo": team_id,
            "nombre_equipo": f"TeamExt{idx}",
            "id_edicion": 3,
            "externo": True,
            "codigo_equipo": team_code,
            "id_usuario": student_user_id,
        })

        integrantes.append({
            "id_integrante": member_id_counter,
            "nombre": "Pedro",
            "apellido": f"Ext{idx}",
            "correo": f"externo{k}@uninorte.edu.co",
            "codigo_estudiantil": student_code_counter,
            "id_equipo": team_id,
            "actualizado_en": "2024-01-01 00:00:00"
        })

        member_nrc.append({
            "A": member_id_counter,
            "B": external_nrc
        })

        videogames.append({
            "id_videojuego": OFFSET + 7000 + k,
            "nombre": f"JuegoExt{idx}",
            "descripcion": f"DescripciónExt{idx}",
            "id_estado_videojuego": 1,
            "id_equipo": team_id,
        })

        member_id_counter += 1
        student_code_counter += 1

    sql += bulk_insert("public.equipos", teams)
    sql += bulk_insert("public.integrante", integrantes)
    sql += bulk_insert("\"_MemberNRC\"", member_nrc)
    sql += bulk_insert("public.videojuegos", videogames)

    return sql

# ----------------------------------------------------------
# WRITE TO FILE
# ----------------------------------------------------------
sql_output = generate_all(
    n_profes=4,
    m_jurors=71,
    t_internal=96,
    t_external=4,
    external_nrc=1,
    students_per_semester=[26, 29, 24, 17]  # must sum to t_internal
)

with open("output.sql", "w", encoding="utf-8") as f:
    f.write(sql_output)

print("SQL file generated: output.sql")
