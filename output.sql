INSERT INTO public.usuarios ("id_usuario", "firstName", "lastName", "correo", "id_rol", "metodo_auth", "contrasena", "id_estado_confirmacion") VALUES
(1001, 'Juan', 'Prof1', 'profesor1@uninorte.edu.co', 3, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(1002, 'Juan', 'Prof2', 'profesor2@uninorte.edu.co', 3, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(1003, 'Juan', 'Prof3', 'profesor3@uninorte.edu.co', 3, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(1004, 'Juan', 'Prof4', 'profesor4@uninorte.edu.co', 3, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1);

INSERT INTO public.materias ("id_materia", "nombre", "abreviacion", "codigo", "semestre") VALUES
(1001, 'Materia1', 'MAT', 'MAT1111', 1),
(1002, 'Materia2', 'MAT', 'MAT2222', 2),
(1003, 'Materia3', 'MAT', 'MAT3333', 3),
(1004, 'Materia4', 'MAT', 'MAT4444', 4);

INSERT INTO public.nrcs ("id_nrc", "codigo", "id_profesor") VALUES
(1001, '1111', 1001),
(1002, '2222', 1002),
(1003, '3333', 1003),
(1004, '4444', 1004);

INSERT INTO public.usuarios ("id_usuario", "firstName", "lastName", "correo", "id_rol", "metodo_auth", "contrasena", "id_estado_confirmacion") VALUES
(1501, 'Juana', 'Jur1', 'jurado1@uninorte.edu.co', 4, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(1502, 'Juana', 'Jur2', 'jurado2@uninorte.edu.co', 4, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(1503, 'Juana', 'Jur3', 'jurado3@uninorte.edu.co', 4, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(1504, 'Juana', 'Jur4', 'jurado4@uninorte.edu.co', 4, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(1505, 'Juana', 'Jur5', 'jurado5@uninorte.edu.co', 4, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(1506, 'Juana', 'Jur6', 'jurado6@uninorte.edu.co', 4, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(1507, 'Juana', 'Jur7', 'jurado7@uninorte.edu.co', 4, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(1508, 'Juana', 'Jur8', 'jurado8@uninorte.edu.co', 4, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(1509, 'Juana', 'Jur9', 'jurado9@uninorte.edu.co', 4, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(1510, 'Juana', 'Jur10', 'jurado10@uninorte.edu.co', 4, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1);

INSERT INTO public.usuarios ("id_usuario", "firstName", "lastName", "correo", "id_rol", "metodo_auth", "contrasena", "id_estado_confirmacion") VALUES
(2001, 'Pedro', 'Est1', 'estudiante1@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(2002, 'Pedro', 'Est2', 'estudiante2@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(2003, 'Pedro', 'Est3', 'estudiante3@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(2004, 'Pedro', 'Est4', 'estudiante4@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(2005, 'Pedro', 'Est5', 'estudiante5@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(2006, 'Pedro', 'Est6', 'estudiante6@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(2007, 'Pedro', 'Est7', 'estudiante7@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(2008, 'Pedro', 'Est8', 'estudiante8@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(2009, 'Pedro', 'Est9', 'estudiante9@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(2010, 'Pedro', 'Est10', 'estudiante10@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(2011, 'Pedro', 'Est11', 'estudiante11@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(2012, 'Pedro', 'Est12', 'estudiante12@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(2013, 'Pedro', 'Est13', 'estudiante13@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(2014, 'Pedro', 'Est14', 'estudiante14@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(2015, 'Pedro', 'Est15', 'estudiante15@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(2016, 'Pedro', 'Est16', 'estudiante16@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1);

INSERT INTO public.usuarios ("id_usuario", "firstName", "lastName", "correo", "id_rol", "metodo_auth", "contrasena", "id_estado_confirmacion") VALUES
(6001, 'Pedro', 'Ext1', 'externo1@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(6002, 'Pedro', 'Ext2', 'externo2@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(6003, 'Pedro', 'Ext3', 'externo3@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(6004, 'Pedro', 'Ext4', 'externo4@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(6005, 'Pedro', 'Ext5', 'externo5@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1),
(6006, 'Pedro', 'Ext6', 'externo6@uninorte.edu.co', 2, 'PASSWORD', '$2b$10$r21ERDp5pUJ6j3FnkGr6xuiBO4G0DTPdkkhKIjg50BCRKMo3eGzGa', 1);

INSERT INTO public.equipos ("id_equipo", "nombre_equipo", "id_edicion", "externo", "teamCode", "id_usuario") VALUES
(4001, 'Team1', 3, False, 'N1-MAT-101', 2001),
(4002, 'Team2', 3, False, 'N1-MAT-102', 2002),
(4003, 'Team3', 3, False, 'N1-MAT-103', 2003),
(4004, 'Team4', 3, False, 'N1-MAT-104', 2004),
(4005, 'Team5', 3, False, 'N2-MAT-201', 2005),
(4006, 'Team6', 3, False, 'N2-MAT-202', 2006),
(4007, 'Team7', 3, False, 'N2-MAT-203', 2007),
(4008, 'Team8', 3, False, 'N2-MAT-204', 2008),
(4009, 'Team9', 3, False, 'N3-MAT-301', 2009),
(4010, 'Team10', 3, False, 'N3-MAT-302', 2010),
(4011, 'Team11', 3, False, 'N3-MAT-303', 2011),
(4012, 'Team12', 3, False, 'N3-MAT-304', 2012),
(4013, 'Team13', 3, False, 'N4-MAT-401', 2013),
(4014, 'Team14', 3, False, 'N4-MAT-402', 2014),
(4015, 'Team15', 3, False, 'N4-MAT-403', 2015),
(4016, 'Team16', 3, False, 'N4-MAT-404', 2016),
(7001, 'TeamExt17', 3, True, 'EXT-MAT-001', 6001),
(7002, 'TeamExt18', 3, True, 'EXT-MAT-002', 6002),
(7003, 'TeamExt19', 3, True, 'EXT-MAT-003', 6003),
(7004, 'TeamExt20', 3, True, 'EXT-MAT-004', 6004),
(7005, 'TeamExt21', 3, True, 'EXT-MAT-005', 6005),
(7006, 'TeamExt22', 3, True, 'EXT-MAT-006', 6006);

INSERT INTO public.integrante ("id_integrante", "nombre", "apellido", "correo", "codigo_estudiantil", "id_equipo") VALUES
(3000, 'Pedro', 'Est1', 'estudiante1@uninorte.edu.co', 1001, 4001),
(3001, 'Pedro', 'Est2', 'estudiante2@uninorte.edu.co', 1002, 4002),
(3002, 'Pedro', 'Est3', 'estudiante3@uninorte.edu.co', 1003, 4003),
(3003, 'Pedro', 'Est4', 'estudiante4@uninorte.edu.co', 1004, 4004),
(3004, 'Pedro', 'Est5', 'estudiante5@uninorte.edu.co', 1005, 4005),
(3005, 'Pedro', 'Est6', 'estudiante6@uninorte.edu.co', 1006, 4006),
(3006, 'Pedro', 'Est7', 'estudiante7@uninorte.edu.co', 1007, 4007),
(3007, 'Pedro', 'Est8', 'estudiante8@uninorte.edu.co', 1008, 4008),
(3008, 'Pedro', 'Est9', 'estudiante9@uninorte.edu.co', 1009, 4009),
(3009, 'Pedro', 'Est10', 'estudiante10@uninorte.edu.co', 1010, 4010),
(3010, 'Pedro', 'Est11', 'estudiante11@uninorte.edu.co', 1011, 4011),
(3011, 'Pedro', 'Est12', 'estudiante12@uninorte.edu.co', 1012, 4012),
(3012, 'Pedro', 'Est13', 'estudiante13@uninorte.edu.co', 1013, 4013),
(3013, 'Pedro', 'Est14', 'estudiante14@uninorte.edu.co', 1014, 4014),
(3014, 'Pedro', 'Est15', 'estudiante15@uninorte.edu.co', 1015, 4015),
(3015, 'Pedro', 'Est16', 'estudiante16@uninorte.edu.co', 1016, 4016),
(3016, 'Pedro', 'Ext17', 'externo1@uninorte.edu.co', 1017, 7001),
(3017, 'Pedro', 'Ext18', 'externo2@uninorte.edu.co', 1018, 7002),
(3018, 'Pedro', 'Ext19', 'externo3@uninorte.edu.co', 1019, 7003),
(3019, 'Pedro', 'Ext20', 'externo4@uninorte.edu.co', 1020, 7004),
(3020, 'Pedro', 'Ext21', 'externo5@uninorte.edu.co', 1021, 7005),
(3021, 'Pedro', 'Ext22', 'externo6@uninorte.edu.co', 1022, 7006);

INSERT INTO public._MemberNRC ("A", "B") VALUES
(3000, 1001),
(3001, 1001),
(3002, 1001),
(3003, 1001),
(3004, 1002),
(3005, 1002),
(3006, 1002),
(3007, 1002),
(3008, 1003),
(3009, 1003),
(3010, 1003),
(3011, 1003),
(3012, 1004),
(3013, 1004),
(3014, 1004),
(3015, 1004),
(3016, 9999),
(3017, 9999),
(3018, 9999),
(3019, 9999),
(3020, 9999),
(3021, 9999);

INSERT INTO public.videojuegos ("id_videojuego", "nombre", "descripcion", "id_estado_videojuego", "id_equipo") VALUES
(5001, 'Juego1', 'Descripción1', 1, 4001),
(5002, 'Juego2', 'Descripción2', 1, 4002),
(5003, 'Juego3', 'Descripción3', 1, 4003),
(5004, 'Juego4', 'Descripción4', 1, 4004),
(5005, 'Juego5', 'Descripción5', 1, 4005),
(5006, 'Juego6', 'Descripción6', 1, 4006),
(5007, 'Juego7', 'Descripción7', 1, 4007),
(5008, 'Juego8', 'Descripción8', 1, 4008),
(5009, 'Juego9', 'Descripción9', 1, 4009),
(5010, 'Juego10', 'Descripción10', 1, 4010),
(5011, 'Juego11', 'Descripción11', 1, 4011),
(5012, 'Juego12', 'Descripción12', 1, 4012),
(5013, 'Juego13', 'Descripción13', 1, 4013),
(5014, 'Juego14', 'Descripción14', 1, 4014),
(5015, 'Juego15', 'Descripción15', 1, 4015),
(5016, 'Juego16', 'Descripción16', 1, 4016),
(8001, 'JuegoExt17', 'DescripciónExt17', 1, 7001),
(8002, 'JuegoExt18', 'DescripciónExt18', 1, 7002),
(8003, 'JuegoExt19', 'DescripciónExt19', 1, 7003),
(8004, 'JuegoExt20', 'DescripciónExt20', 1, 7004),
(8005, 'JuegoExt21', 'DescripciónExt21', 1, 7005),
(8006, 'JuegoExt22', 'DescripciónExt22', 1, 7006);

